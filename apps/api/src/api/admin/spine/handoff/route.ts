/**
 * POST /admin/spine/handoff (WRDO-180, Task 9, Part B)
 *
 * Mint a single-use web-handoff token for a phone and return the "continue on
 * web" URL (shop.wrdo.co.za/c?t=<token>). This is the guarded mint surface — the
 * WhatsApp side does NOT auto-send links to users; this route makes a token
 * available for testing (Task 12 acceptance) and for an operator/flow to hand off.
 *
 * Auth: /admin routes carry Medusa admin authentication automatically — only a
 * logged-in admin can mint. The phone resolves to the canonical wrdo_users.id via
 * getOrCreateByChannelIdentity (idempotent; reuses the guest row, never duplicates).
 */

import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';

import { WRDO_USER_MODULE, WrdoUserService } from '../../../../modules/wrdo-user';
import type { WrdoUserDirectory } from '../../../../modules/wrdo-user';
import { createWebHandoffMinter } from '../../../../modules/whatsapp/web-handoff-mint';
import { createRedisAdapter } from '../../../../modules/whatsapp/redis-adapter';

interface HandoffBody {
  phone?: unknown;
}

function storefrontBase(): string {
  const url = process.env['STOREFRONT_URL'];
  return url !== undefined && url !== '' ? url.replace(/\/$/, '') : 'http://localhost:8000';
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const body = (req.body ?? {}) as HandoffBody;
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (phone === '') {
    res.status(400).json({ error: 'missing phone' });
    return;
  }

  // Fail-fast on a missing secret BEFORE touching the DB — surfaces the misconfig
  // clearly rather than minting an unverifiable token.
  let mint: (userId: string) => Promise<string>;
  try {
    mint = createWebHandoffMinter({ kv: createRedisAdapter() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'mint unavailable' });
    return;
  }

  const dir = req.scope.resolve(WRDO_USER_MODULE) as WrdoUserDirectory;
  const userSvc = new WrdoUserService(dir);
  // Idempotent: reuses the guest row born at first WhatsApp contact; never duplicates.
  const user = await userSvc.getOrCreateByChannelIdentity('whatsapp', phone, {
    registrationState: 'guest',
  });

  const token = await mint(user.id);
  res.json({ url: `${storefrontBase()}/c?t=${token}` });
}
