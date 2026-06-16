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

  // TEMP DIAGNOSTIC (WRDO-169): x-wrdo-debug-pipeline:1 runs the real pipeline on
  // a synthetic message WITHOUT handlePayload's swallowing catch, surfacing the
  // throw + stack in the response. Remove after the live test passes.
  if (req.headers['x-wrdo-debug-pipeline'] === '1') {
    const pid = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
    const to = (req.headers['x-wrdo-debug-to'] as string | undefined) ?? '27761271676';
    const synthetic = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '0',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '+27721104651', phone_number_id: pid },
                contacts: [{ profile: { name: 'Probe' }, wa_id: to.replaceAll(/\D/g, '') }],
                messages: [
                  {
                    from: to.replaceAll(/\D/g, ''),
                    id: `wamid.PIPEPROBE${String(Date.now())}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: 'pipeline probe' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };
    let pipeline: unknown;
    let directSend: unknown = 'not-run';
    try {
      const p = createWebhookPipeline({ logger: logger ? logger : undefined, scope: req.scope });
      const pAny = p as unknown as {
        opts: {
          handlerService: { parsePayload: (x: unknown) => unknown };
          messageSenderService: {
            sendText: (to: string, body: string) => Promise<unknown>;
          };
        };
        processParsedResult: (r: unknown) => Promise<void>;
      };
      // Call the pipeline's OWN messageSenderService — the exact instance the
      // reply path uses — and return its SendMessageResult so we see success/error.
      directSend = await pAny.opts.messageSenderService.sendText(
        to.replaceAll(/\D/g, ''),
        'WRDO pipeline-sender probe',
      );
      const parsed = pAny.opts.handlerService.parsePayload(synthetic);
      await pAny.processParsedResult(parsed);
      pipeline = 'completed-no-throw';
    } catch (e) {
      pipeline = {
        throw: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? (e.stack ?? '').split('\n').slice(0, 8) : undefined,
      };
    }
    res.status(200).json({ pipeline, directSend });
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
