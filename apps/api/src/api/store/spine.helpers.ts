/**
 * Spine store-API helpers (WRDO-180, Task 8).
 *
 * Pure, dependency-light helpers shared by the same-origin store routes:
 *   - assertSecret    — fail-fast env reads (no weak defaults)
 *   - signUserCookie / readUserCookie — HMAC-signed first-party auth cookie
 *   - getSpineUserId  — read the wrdo_spine cookie off the request
 *   - buildThreadService — resolve the tribe_messages module and wrap it as a
 *     ThreadServiceDirectory, translating the cursor into the REAL Medusa
 *     `created_at >= X` filter.
 *
 * The cookie is the entire same-origin auth: it carries userId and is signed
 * with COOKIE_SECRET so it cannot be forged. The signature uses a timing-safe,
 * length-guarded compare and fails closed on any malformed input.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MedusaRequest } from '@medusajs/framework/http';

import {
  ThreadService,
  TRIBE_MESSAGES_MODULE,
  type MessageRecord,
  type ThreadRecord,
  type ThreadServiceDirectory,
} from '../../modules/tribe-messages';

export const SPINE_COOKIE_NAME = 'wrdo_spine';

/** Read a required env var; throw a clear error if missing/empty (fail-fast). */
export function assertSecret(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Timing-safe, length-guarded string compare. Fails closed. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Produce the signed cookie value `userId.sig` for a user. */
export function signUserCookie(userId: string, secret: string): string {
  return `${userId}.${sign(userId, secret)}`;
}

/**
 * Verify a signed cookie value and return the userId, or null when missing,
 * malformed, or forged. The userId itself may contain no dots (Medusa ids use
 * `_`), so we split on the LAST dot to separate payload from signature.
 */
export function readUserCookie(value: string | undefined | null, secret: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const lastDot = value.lastIndexOf('.');
  if (lastDot <= 0) {
    return null;
  }
  const userId = value.slice(0, lastDot);
  const sig = value.slice(lastDot + 1);
  if (userId === '' || sig === '') {
    return null;
  }
  if (!safeEqual(sign(userId, secret), sig)) {
    return null;
  }
  return userId;
}

/**
 * Parse a raw `Cookie` header into a name→value map. Robust fallback for when
 * cookie-parser has not populated req.cookies.
 */
function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (header === undefined || header === '') {
    return out;
  }
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const name = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (name !== '') {
      out[name] = decodeURIComponent(val);
    }
  }
  return out;
}

/**
 * Read the wrdo_spine cookie off the request and verify it with COOKIE_SECRET.
 * Returns the userId or null. Prefers cookie-parser's req.cookies; falls back to
 * parsing the raw Cookie header if not populated.
 */
export function getSpineUserId(req: MedusaRequest): string | null {
  const secret = assertSecret('COOKIE_SECRET');
  const reqCookies = (req as MedusaRequest & { cookies?: Record<string, string> }).cookies;
  let raw: string | undefined =
    reqCookies !== undefined && reqCookies !== null ? reqCookies[SPINE_COOKIE_NAME] : undefined;
  if (raw === undefined) {
    const header = req.headers['cookie'] as string | undefined;
    raw = parseCookieHeader(header)[SPINE_COOKIE_NAME];
  }
  return readUserCookie(raw, secret);
}

/**
 * Wrap the resolved tribe_messages MedusaService as a ThreadServiceDirectory.
 *
 * The cursor: ThreadService.getMessages passes `{ thread_id, _after }` to
 * listTribeMessages. We translate `_after` (an ISO timestamp) into the REAL
 * Medusa query operator `{ created_at: { $gte: <Date> } }` against the
 * (thread_id, created_at) composite index, and force ascending order. The
 * test-only `_after` key never reaches Medusa.
 *
 * Why $gte (inclusive) and not $gt: two messages sharing the same millisecond
 * created_at could cause the second to be SKIPPED on the next poll under an
 * exclusive cursor — that's silent data loss. $gte re-delivers the boundary
 * message at most once; the widget dedupes by id, so the re-delivery is
 * harmless. Trade a harmless (absorbed) re-delivery for never-skip.
 */
export function buildThreadService(scope: {
  resolve: (key: string) => unknown;
}): ThreadService {
  const mod = scope.resolve(TRIBE_MESSAGES_MODULE) as {
    listTribeThreads(filters: Record<string, unknown>): Promise<ThreadRecord[]>;
    createTribeThreads(data: Record<string, unknown>): Promise<ThreadRecord>;
    updateTribeThreads(data: Record<string, unknown>): Promise<ThreadRecord>;
    createTribeMessages(data: Record<string, unknown>): Promise<MessageRecord>;
    listTribeMessages(
      filters: Record<string, unknown>,
      config?: Record<string, unknown>,
    ): Promise<MessageRecord[]>;
  };

  const dir: ThreadServiceDirectory = {
    listTribeThreads: (filters) => mod.listTribeThreads(filters),
    createTribeThreads: (data) => mod.createTribeThreads(data),
    updateTribeThreads: (data) => mod.updateTribeThreads(data),
    createTribeMessages: (data) => mod.createTribeMessages(data),
    listTribeMessages: (filters, config) => {
      // Translate the test-only `_after` cursor into the real Medusa filter.
      const { _after, ...rest } = filters as { _after?: string } & Record<string, unknown>;
      const realFilters: Record<string, unknown> = { ...rest };
      if (typeof _after === 'string' && _after !== '') {
        // $gte (inclusive): never skip a same-millisecond message; the boundary
        // re-delivery is absorbed by the widget's id-based dedupe.
        realFilters['created_at'] = { $gte: new Date(_after) };
      }
      const realConfig: Record<string, unknown> = {
        order: { created_at: 'ASC' },
        ...config,
      };
      return mod.listTribeMessages(realFilters, realConfig);
    },
  };

  return new ThreadService(dir);
}
