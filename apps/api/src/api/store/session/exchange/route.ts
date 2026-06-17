/**
 * POST /store/session/exchange (WRDO-180, Task 8)
 *
 * The single auth primitive for the same-origin spine. Exchanges a single-use
 * web token (minted server-side, e.g. handed to a WhatsApp webview) for a signed
 * first-party httpOnly cookie carrying the userId. From here on every spine
 * route reads userId off that cookie — no token is ever re-presented.
 */

import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';

import { createWebTokenService } from '../../../../modules/tribe-messages';
import { createRedisAdapter } from '../../../../modules/whatsapp/redis-adapter';
import { assertSecret, signUserCookie, SPINE_COOKIE_NAME } from '../../spine.helpers';

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  // Fail-fast: a strong SPINE_TOKEN_SECRET is the ENTIRE token-forgery defense.
  const tokenSecret = assertSecret('SPINE_TOKEN_SECRET');
  const cookieSecret = assertSecret('COOKIE_SECRET');

  const body = (req.body ?? {}) as { t?: unknown };
  const token = typeof body.t === 'string' ? body.t : '';
  if (token === '') {
    res.status(400).json({ error: 'missing token' });
    return;
  }

  // The KV del MUST be atomic and return the removed count — verifyAndBurn relies
  // on it to enforce single-use (ioredis DEL returns the integer count removed).
  const tokenSvc = createWebTokenService({ kv: createRedisAdapter(), secret: tokenSecret });
  const userId = await tokenSvc.verifyAndBurn(token);
  if (userId === null) {
    res.status(401).json({ error: 'invalid or expired token' });
    return;
  }

  res.cookie(SPINE_COOKIE_NAME, signUserCookie(userId, cookieSecret), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });
  res.json({ ok: true });
}
