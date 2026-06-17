/**
 * Web-handoff mint (WRDO-180, Task 9, Part B).
 *
 * The token MINT point for the WhatsApp side of the conversation spine. A
 * WhatsApp flow that wants to hand the conversation off to the web ("continue on
 * web") mints a single-use `t` here, then the storefront exchanges it for a
 * first-party cookie at POST /spine/session/exchange (Task 8). This module only
 * MINTS — it deliberately does NOT auto-send any link to a user.
 *
 * The secret is read fail-fast (a strong SPINE_TOKEN_SECRET is the ENTIRE
 * token-forgery defense). We reuse the canonical assertSecret + env name from the
 * spine helpers so there is one source of truth.
 */

import { createWebTokenService, type WebTokenKv } from '../tribe-messages';
import { assertSecret } from '../../api/spine/spine.helpers';

export interface CreateWebHandoffMinterOptions {
  /** KV store backing single-use nonces (createRedisAdapter() in production). */
  kv: WebTokenKv;
}

/** A function that mints a single-use web-handoff token for a wrdo_user id. */
export type WebHandoffMinter = (userId: string) => Promise<string>;

/**
 * Build a mint function bound to the configured SPINE_TOKEN_SECRET.
 *
 * Throws synchronously if SPINE_TOKEN_SECRET is unset — fail-fast at wire time,
 * never silently minting unverifiable tokens.
 *
 * @param options - KV store for nonce single-use tracking.
 * @returns A `mint(userId) => Promise<token>` function.
 */
export function createWebHandoffMinter(options: CreateWebHandoffMinterOptions): WebHandoffMinter {
  const secret = assertSecret('SPINE_TOKEN_SECRET');
  const tokenSvc = createWebTokenService({ kv: options.kv, secret });
  return (userId: string) => tokenSvc.mint(userId);
}
