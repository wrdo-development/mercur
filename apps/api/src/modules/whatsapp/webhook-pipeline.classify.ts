/**
 * AI client intent classification and flow routing for the webhook pipeline.
 *
 * OTel span name is `heart.classify` and attribute key is `heart.intent` — kept
 * as-is for now (ops dashboards not yet built; rename when LiteLLM is wired).
 *
 * TODO: replace stub AI client with LiteLLM when Tribe goes live (Heart decommissioned)
 */

import { performance } from 'node:perf_hooks';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { Intent } from '../../types/ai-client.types';
import { BookingFlowHandler } from './flow-engine/booking.flow-handler';
import { RegistrationFlowHandler } from './flow-engine/registration.flow-handler';
import type { WebhookPipelineServiceOptions } from './webhook-pipeline.types';
import type { WhatsappLogger } from './whatsapp.logger';

const tracer = trace.getTracer('wrdo-tribe-api.webhook');

export interface ClassifyAndRouteOptions {
  aiClient: WebhookPipelineServiceOptions['aiClient'];
  degradationService: WebhookPipelineServiceOptions['degradationService'];
  bookingFlowHandler: WebhookPipelineServiceOptions['bookingFlowHandler'];
  registrationFlowHandler: WebhookPipelineServiceOptions['registrationFlowHandler'];
  whatsappLogger?: WhatsappLogger;
}

export interface ClassifyAndRouteResult {
  replyText: string;
  intent: Intent;
}

/**
 * Classify user intent via the AI client and route to the appropriate flow or compose
 * a general reply.
 */
export async function classifyAndRoute(
  options: ClassifyAndRouteOptions,
  from: string,
  userMessage: string,
  messageType: 'text' | 'image' | 'audio' | 'location',
): Promise<ClassifyAndRouteResult> {
  const {
    aiClient,
    degradationService,
    bookingFlowHandler,
    registrationFlowHandler,
    whatsappLogger,
  } = options;

  let intent: Intent = 'unknown';
  let replyText = '';
  const classify = { failed: false };

  await tracer.startActiveSpan('heart.classify', async (span) => {
    const tClassify = performance.now();
    try {
      const intentRes = await aiClient.classifyIntent({
        message: userMessage,
        phone: from,
        messageType,
      });
      intent = intentRes.intent;
      span.setAttributes({ 'heart.intent': intentRes.intent });
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      classify.failed = true;
      replyText = degradationService.getMessageFor('upstream_error');
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
    } finally {
      whatsappLogger?.logTiming('heart.classify', Math.round(performance.now() - tClassify));
      span.end();
    }
  });

  const resolvedIntent = intent as Intent;
  if (!classify.failed) {
    if (resolvedIntent === 'book_service' || BookingFlowHandler.isBookingTrigger(userMessage)) {
      replyText = await bookingFlowHandler.startBooking(from);
    } else if (
      resolvedIntent === 'register' ||
      RegistrationFlowHandler.isRegistrationTrigger(userMessage)
    ) {
      replyText = await registrationFlowHandler.startRegistration(from);
    } else {
      const tCompose = performance.now();
      try {
        const composeRes = await aiClient.compose({
          userPhone: from,
          userMessage,
          intent: resolvedIntent,
        });
        replyText = composeRes.message;
      } catch {
        replyText = degradationService.getMessageFor('upstream_error');
      } finally {
        whatsappLogger?.logTiming('heart.compose', Math.round(performance.now() - tCompose));
      }
    }
  }

  return { replyText, intent };
}
