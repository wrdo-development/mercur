/**
 * Webhook pipeline: parse -> idempotency -> killswitch -> AI (or Tier 0) -> send -> emit event.
 * Single entry point for POST /webhooks/whatsapp message handling.
 *
 * Finding 9.5: OTel spans added at 3 critical checkpoints:
 *   1. webhook.handle  -- overall handlePayload span
 *   2. ai.classify  -- AI intent classification
 *   3. whatsapp.send   -- message dispatch to Meta
 */

import { performance } from 'node:perf_hooks';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { isBookingFlow, isRegistrationFlow } from '../tribe-sessions/conversation-state.service';
import { handleFeedback } from './feedback/feedback-handler';
import { classifyAndRoute } from './webhook-pipeline.classify';
import { fireAndForgetLogEvent } from './webhook-pipeline.log-event';
import type { WebhookPipelineServiceOptions } from './webhook-pipeline.types';
import { getMessageTextAndType, tryExtractForParseError } from './webhook-pipeline.utils';
import { redactMessageId } from './whatsapp.logger';

export type { WebhookPipelineServiceOptions } from './webhook-pipeline.types';

const tracer = trace.getTracer('wrdo-tribe-api.webhook');

/**
 * Pipeline service: runs idempotency -> killswitch -> AI or Tier 0 -> send -> emit event.
 * DI-injectable; all dependencies passed in constructor.
 */
export class WebhookPipelineService {
  private readonly opts: WebhookPipelineServiceOptions;
  private readonly nowFn: () => Date;

  constructor(options: WebhookPipelineServiceOptions) {
    this.opts = options;
    this.nowFn = options.nowFn ?? (() => new Date());
  }

  /**
   * Process a parsed webhook result: idempotency -> killswitch -> flow check -> AI -> send.
   */
  async processParsedResult(
    result: ReturnType<WebhookPipelineServiceOptions['handlerService']['parsePayload']>,
  ): Promise<void> {
    if (result === null) {
      return;
    }
    const firstMessage = this.opts.handlerService.getFirstMessage(result);
    if (firstMessage === undefined) {
      return;
    }

    const { id: messageId, from } = firstMessage;
    const tIdempotency = performance.now();
    const isNew = await this.opts.idempotencyService.isNew(messageId);
    this.opts.whatsappLogger?.logTiming(
      'idempotency_check',
      Math.round(performance.now() - tIdempotency),
    );
    if (!isNew) {
      this.opts.whatsappLogger?.logIdempotencyHit(redactMessageId(messageId));
      return;
    }

    // Guest-first (WRDO-180): birth a wrdo_user at FIRST contact so the
    // conversation spine has a stable user_id from message one. Idempotent +
    // no-clobber (getOrCreate only sets state on CREATE), so this is safe to
    // call on every inbound — a returning 'complete' user is never downgraded.
    // Best-effort: a write failure must NEVER block the WhatsApp reply.
    if (this.opts.ensureGuestUser !== undefined) {
      try {
        await this.opts.ensureGuestUser(from);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          '[whatsapp] ensureGuest failed (best-effort, WRDO-180):',
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    if (result.identityPair !== null && this.opts.tribeUserService !== undefined) {
      try {
        await this.opts.tribeUserService.updateBsuidByPhone(
          result.identityPair.phone,
          result.identityPair.bsuid,
        );
      } catch (err) {
        // BSUID pairing is best-effort — never fail webhook processing on it.
        const bsuidPrefix = result.identityPair.bsuid.slice(0, 6);
        this.opts.whatsappLogger?.logServiceWarn(
          'bsuid_pair_error',
          `BSUID pairing write failed — best-effort, message processing continues (bsuid prefix: ${bsuidPrefix}…, cause: ${err instanceof Error ? err.message : String(err)})`,
        );
      }
    } else if (result.identityPair !== null && this.opts.tribeUserService === undefined) {
      // identityPair present but no tribeUserService injected — no-op by design.
      // Debug breadcrumb so the production silence is traceable.
      // Fires per-message so intentionally debug, not warn (see WRDO-169).
      this.opts.whatsappLogger?.logServiceDebug(
        'bsuid_pairing_inactive',
        'BSUID pairing inactive: tribeUserService not injected — see WRDO-169',
      );
    }

    const { message: userMessage, messageType } = getMessageTextAndType(firstMessage);

    // Check for reply-to feedback signal (context.message_id present = user replied to a WRDO message)
    if (this.opts.feedbackHandlerDeps !== undefined) {
      const contextId = this.extractContextId(firstMessage);
      if (contextId !== null) {
        // Fire-and-forget — never block the pipeline on feedback capture
        void handleFeedback(this.opts.feedbackHandlerDeps, {
          userId: from,
          quotedMsgId: contextId,
          replyText: userMessage,
          // TODO(phase-3): pass langProfile snapshot from languageDetectionService
          langProfile: null,
          correlationId: null,
        });
        // Note: we do NOT return early — the message still goes through normal pipeline.
        // A reply might be both feedback AND a real message.
      }
    }

    // 0. Language detection + confirmation
    if (this.opts.languageDetectionService !== undefined) {
      const langResult = await this.opts.languageDetectionService.processMessage(from, userMessage);
      if (langResult.confirmationReply !== null) {
        await this.opts.messageSenderService.sendText(from, langResult.confirmationReply);
        return; // language nudge sent — don't run normal pipeline this turn
      }
    }

    if (!this.opts.killswitchService.isAiEnabled()) {
      await this.sendTier0Fallback(from);
      return;
    }

    // 1. Check if Provider Response to a Pending Booking
    const providerResult = await this.opts.bookingFlowHandler.handleProviderResponse(
      from,
      userMessage,
    );
    if (providerResult.handled) {
      const msg =
        typeof providerResult.message === 'string' && providerResult.message !== ''
          ? providerResult.message
          : 'Thank you! We have updated the booking status.';
      await this.opts.messageSenderService.sendText(from, msg);
      return;
    }

    // 2. Check Conversation State
    const flowReply = await this.checkConversationState(from, userMessage, messageType);
    if (flowReply !== null) {
      await this.opts.messageSenderService.sendText(from, flowReply);
      return;
    }

    // 3. No state -- classify intent and route. Pass the WhatsApp profile name
    // through so a fresh registration confirms it instead of asking cold
    // (confirm-not-collect, WRDO-169).
    const { replyText, intent } = await classifyAndRoute(
      {
        aiClient: this.opts.aiClient,
        degradationService: this.opts.degradationService,
        bookingFlowHandler: this.opts.bookingFlowHandler,
        registrationFlowHandler: this.opts.registrationFlowHandler,
        whatsappLogger: this.opts.whatsappLogger,
      },
      from,
      userMessage,
      messageType,
      result.contactName,
    );

    await this.sendReplyWithSpan(from, replyText);
    fireAndForgetLogEvent(this.opts.aiClient, from, messageId, intent, this.nowFn);
  }

  /**
   * Parse payload and process. No-op if payload invalid. Always returns; throws never.
   */
  async handlePayload(payload: unknown): Promise<void> {
    await tracer.startActiveSpan('webhook.handle', async (span) => {
      try {
        const result = this.opts.handlerService.parsePayload(payload);
        if (result === null) {
          const { phoneRedacted, messageIdRedacted } = tryExtractForParseError(payload);
          this.opts.whatsappLogger?.logParseError(
            'invalid payload structure',
            phoneRedacted,
            messageIdRedacted,
          );
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'invalid payload' });
          return;
        }
        await this.processParsedResult(result);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        // WRDO-169: this catch was silently swallowing pipeline throws — the
        // reason inbound 200s produced no reply with no visible error. Surface
        // the actual error (stack) so the failing step is diagnosable, while
        // still never throwing out of handlePayload (Meta needs the 200).
        const e = err as Error;
        const msg = e?.message ?? String(err);
        // console.error reaches Cloud's log stream (the module's WhatsappLogger
        // does not surface there). Never re-throw — Meta needs the 200.
        // eslint-disable-next-line no-console
        console.error('[whatsapp] pipeline error:', msg, e?.stack ?? '');
        span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
      } finally {
        span.end();
      }
    });
  }

  private async sendTier0Fallback(to: string): Promise<void> {
    const tier0Message = this.opts.degradationService.getTier0DefaultMessage();
    const sendResult = await this.opts.messageSenderService.sendText(to, tier0Message);
    if (!sendResult.success && this.opts.whatsappLogger) {
      this.opts.whatsappLogger.logFailedSend(
        sendResult.errorCode ?? 'unknown',
        sendResult.error ?? 'unknown',
      );
    }
  }

  private async checkConversationState(
    from: string,
    userMessage: string,
    messageType: string,
  ): Promise<string | null> {
    const state = await this.opts.conversationStateService.getState(from);

    if (state !== null && isBookingFlow(state)) {
      const flowResult = await this.opts.bookingFlowHandler.processInput(
        from,
        state,
        userMessage,
        messageType,
      );
      return flowResult.message;
    }

    if (state !== null && isRegistrationFlow(state)) {
      const flowResult = await this.opts.registrationFlowHandler.processInput(
        from,
        state,
        userMessage,
        messageType,
      );
      return flowResult.message;
    }

    return null;
  }

  private extractContextId(message: { context?: { message_id?: string } }): string | null {
    return message.context?.message_id ?? null;
  }

  private async sendReplyWithSpan(to: string, text: string): Promise<void> {
    await tracer.startActiveSpan('whatsapp.send', async (span) => {
      try {
        const sendResult = await this.opts.messageSenderService.sendText(to, text);
        if (!sendResult.success && this.opts.whatsappLogger) {
          this.opts.whatsappLogger.logFailedSend(
            sendResult.errorCode ?? 'unknown',
            sendResult.error ?? 'unknown',
          );
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: sendResult.error ?? 'send failed',
          });
          return;
        }
        span.setStatus({ code: SpanStatusCode.OK });
      } finally {
        span.end();
      }
    });
  }
}
