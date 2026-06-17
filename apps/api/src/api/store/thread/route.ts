/**
 * GET /store/thread (WRDO-180, Task 8)
 *
 * Return the person's single thread plus a coarse unread count. Auth is the
 * signed wrdo_spine cookie — no cookie → 401.
 */

import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';

import { buildThreadService, getSpineUserId } from '../spine.helpers';

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const userId = getSpineUserId(req);
  if (userId === null) {
    res.status(401).json({ error: 'not authenticated' });
    return;
  }

  const threads = buildThreadService(req.scope);
  const thread = await threads.getThread(userId);

  // TODO(WRDO-180): real read-state tracking (per-channel last-read marker).
  // For this slice unreadCount is the count of WRDO-sent messages, which is a
  // usable upper bound until a read-marker lands.
  const messages = await threads.getMessages(userId);
  const unreadCount = messages.filter((m) => m.sender === 'wrdo').length;

  res.json({ thread, unreadCount });
}
