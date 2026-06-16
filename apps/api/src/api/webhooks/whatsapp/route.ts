import { timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { createWebhookPipeline } from '../../../modules/whatsapp';
import { verifyHmac } from '../../../modules/whatsapp/hmac.guard';

type WebhookLogger =
  | {
      info: (msg: string, meta?: unknown) => void;
      warn: (msg: string, meta?: unknown) => void;
      error: (msg: string, meta?: unknown) => void;
    }
  | undefined;

/**
 * GET /webhooks/whatsapp
 * Meta webhook verification: returns hub.challenge when hub.verify_token matches WHATSAPP_VERIFY_TOKEN.
 */
export const GET = (req: MedusaRequest, res: MedusaResponse): void => {
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  if (mode === undefined || token === undefined || challenge === undefined) {
    res.status(400).json({ error: 'Missing required query parameters' });
    return;
  }

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? '';
  const tokenBuf = Buffer.from(token, 'utf8');
  const verifyBuf = Buffer.from(verifyToken, 'utf8');
  if (tokenBuf.length !== verifyBuf.length || !timingSafeEqual(tokenBuf, verifyBuf)) {
    res.status(403).json({ error: 'Invalid verify token' });
    return;
  }

  res.status(200).send(challenge);
};

/**
 * POST /webhooks/whatsapp
 * Receives webhook events from Meta. Verifies HMAC, parses payload, runs pipeline, returns 200.
 * Always returns 200 to Meta (even on error) to prevent retries.
 */
/* eslint-disable complexity -- verification, pipeline wiring, and error handling are sequential */
export const POST = async (req: MedusaRequest, res: MedusaResponse): Promise<void> => {
  const t0 = performance.now();
  const logger = req.scope.resolve<WebhookLogger>(ContainerRegistrationKeys.LOGGER);

  // TEMP DIAGNOSTIC (WRDO-169 live-test): log env-var LENGTHS only (never values).
  // Remove once the live phone test passes.
  logger?.info('webhook.env_check', {
    accessTokenLen: (process.env.WHATSAPP_ACCESS_TOKEN ?? '').length,
    phoneNumberIdLen: (process.env.WHATSAPP_PHONE_NUMBER_ID ?? '').length,
    appSecretLen: (process.env.WHATSAPP_APP_SECRET ?? '').length,
    verifyTokenLen: (process.env.WHATSAPP_VERIFY_TOKEN ?? '').length,
    redisUrlScheme: (process.env.REDIS_URL ?? '').slice(0, 8),
    aiEnabled: process.env.WRDO_AI_ENABLED ?? '(unset)',
  });

  // TEMP DIAGNOSTIC (WRDO-169): when the x-wrdo-debug header is present, return
  // env-var lengths AND the result of a real Meta send straight in the response
  // body — so the cause of the silent send failure is visible without the Cloud
  // log UI. Lengths only, never values. Header-gated. Remove after the test.
  if (req.headers['x-wrdo-debug'] === '1') {
    const at = process.env.WHATSAPP_ACCESS_TOKEN ?? '';
    const pid = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
    const to = (req.headers['x-wrdo-debug-to'] as string | undefined) ?? '';
    let send: unknown = 'no-to-header';
    if (to !== '') {
      try {
        const r = await fetch(`https://graph.facebook.com/v21.0/${pid}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to.replaceAll(/\D/g, ''),
            type: 'text',
            text: { body: 'WRDO container send probe' },
          }),
        });
        send = { status: r.status, body: await r.json() };
      } catch (e) {
        send = { fetchError: e instanceof Error ? e.message : String(e) };
      }
    }
    res.status(200).json({
      env: {
        accessTokenLen: at.length,
        phoneNumberIdLen: pid.length,
        appSecretLen: (process.env.WHATSAPP_APP_SECRET ?? '').length,
        redisUrlScheme: (process.env.REDIS_URL ?? '').slice(0, 9),
      },
      send,
    });
    return;
  }

  try {
    const rawBody: unknown = req.rawBody ?? req.body;

    // --- HMAC verify (includes body coercion) ---
    const tHmacStart = performance.now();
    const body: string = Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf8')
      : typeof rawBody === 'string'
        ? rawBody
        : JSON.stringify(rawBody ?? {});
    const signature = (req.headers['x-hub-signature-256'] as string | undefined) ?? undefined;
    const secret = process.env.WHATSAPP_APP_SECRET ?? '';
    const valid = verifyHmac({ body, signatureHeader: signature, secret });
    logger?.info('webhook.timing', {
      step: 'hmac_verify',
      durationMs: Math.round(performance.now() - tHmacStart),
    });

    if (!valid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // --- Body parse ---
    const tParseStart = performance.now();
    const payload: unknown =
      typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(body);
    logger?.info('webhook.timing', {
      step: 'body_parse',
      durationMs: Math.round(performance.now() - tParseStart),
    });

    // --- Pipeline (idempotency + AI + send) ---
    const tPipelineStart = performance.now();
    const pipeline = createWebhookPipeline({
      logger: logger ? logger : undefined,
      scope: req.scope,
    });
    await pipeline.handlePayload(payload);
    logger?.info('webhook.timing', {
      step: 'pipeline',
      durationMs: Math.round(performance.now() - tPipelineStart),
    });

    logger?.info('webhook.timing', {
      step: 'total',
      durationMs: Math.round(performance.now() - t0),
    });
    res.status(200).send();
  } catch (err: unknown) {
    // Still return 200 to Meta to prevent retries, but surface the error.
    const body = req.body as
      | { entry?: Array<{ changes?: Array<{ value?: { messages?: Array<{ from?: string }> } }> }> }
      | undefined;
    logger?.error('WhatsApp webhook pipeline failed', {
      err,
      phone: body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from,
      totalMs: Math.round(performance.now() - t0),
    });
    res.status(200).send();
  }
};
/* eslint-enable complexity */
