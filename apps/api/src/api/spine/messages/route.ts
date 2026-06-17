/**
 * /spine/messages (WRDO-180, Task 8)
 *
 * POST — append one web turn to the person's single thread and return WRDO's
 *        reply (rendered for web). Idempotent on client_msg_id so a retried
 *        send doesn't double-append.
 * GET  — read this person's messages, optionally after a created_at cursor.
 *
 * Auth is the signed wrdo_spine cookie (see spine.helpers). No cookie → 401.
 */

import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';

import { createAiClient } from '../../../clients/ai-client/ai-client';
import { WebRenderer, type WrdoReply } from '../../../modules/tribe-messages';
import { IdempotencyService } from '../../../modules/whatsapp/idempotency.service';
import { createRedisAdapter } from '../../../modules/whatsapp/redis-adapter';
import { buildThreadService, getSpineUserId } from '../spine.helpers';

interface PostMessageBody {
  text?: unknown;
  context?: unknown;
  client_msg_id?: unknown;
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const userId = getSpineUserId(req);
  if (userId === null) {
    res.status(401).json({ error: 'not authenticated' });
    return;
  }

  const body = (req.body ?? {}) as PostMessageBody;
  const text = typeof body.text === 'string' ? body.text : '';
  const clientMsgId = typeof body.client_msg_id === 'string' ? body.client_msg_id : '';
  const context =
    typeof body.context === 'object' && body.context !== null
      ? (body.context as Record<string, unknown>)
      : null;
  if (text === '' || clientMsgId === '') {
    res.status(400).json({ error: 'text and client_msg_id are required' });
    return;
  }

  // Idempotency: a retried POST with the same client_msg_id must not double-append.
  const idempotency = new IdempotencyService({ redis: createRedisAdapter() });
  const isNew = await idempotency.isNew(`web:${userId}:${clientMsgId}`);
  if (!isNew) {
    // Duplicate send — acknowledge without re-appending. Empty reply slice.
    res.json(new WebRenderer().render({ text: '' }));
    return;
  }

  const threads = buildThreadService(req.scope);
  await threads.appendMessage(userId, { sender: 'user', channel: 'web', text, context });

  // Compose a reply (AI client is a stub today — friendly fallback message).
  const ai = createAiClient();
  const composed = await ai.compose({ userPhone: userId, userMessage: text, intent: 'unknown' });
  const reply: WrdoReply = { text: composed.message };

  await threads.appendMessage(userId, { sender: 'wrdo', channel: 'web', text: reply.text });

  res.json(new WebRenderer().render(reply));
}

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const userId = getSpineUserId(req);
  if (userId === null) {
    res.status(401).json({ error: 'not authenticated' });
    return;
  }

  const after = typeof req.query['after'] === 'string' ? req.query['after'] : undefined;
  const threads = buildThreadService(req.scope);
  const messages = await threads.getMessages(userId, after !== undefined ? { after } : {});
  res.json({ messages });
}
