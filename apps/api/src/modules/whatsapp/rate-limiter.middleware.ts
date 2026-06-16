/**
 * Rate limiter for WhatsApp webhook per phone number.
 * Sliding window: 20 messages/minute; warn at 15, throttle at 18, mute at 20.
 * Redis key: ratelimit:wa:{phone} (sorted set of timestamps).
 */

import type { RedisAdapter } from './idempotency.service';

const KEY_PREFIX = 'ratelimit:wa:';
const WINDOW_MS = 60 * 1000; // 1 minute
const LIMIT_NORMAL = 20;
const WARN_AT = 15;
const THROTTLE_AT = 18;

export type RateLimitStatus = 'ok' | 'warn' | 'throttle' | 'mute';

export interface RateLimitResult {
  allowed: boolean;
  status: RateLimitStatus;
  count: number;
}

export interface RateLimiterMiddlewareOptions {
  redis: RedisAdapter & {
    zadd(key: string, score: number, member: string): Promise<unknown>;
    zremrangebyscore(key: string, min: number, max: number): Promise<unknown>;
    zcard(key: string): Promise<number>;
  };
}

/**
 * Check rate limit for a phone number. Call before processing each message.
 * Uses sliding window: count entries in last WINDOW_MS.
 *
 * @param redis - Redis client with ZADD, ZREMRANGEBYSCORE, ZCARD
 * @param phone - E.164 phone number
 * @returns allowed (false when muted), status, and current count
 */
export async function checkRateLimit(
  redis: RateLimiterMiddlewareOptions['redis'],
  phone: string,
  nowMs: () => number = () => Date.now(),
): Promise<RateLimitResult> {
  const key = KEY_PREFIX + phone.replaceAll(/\D/g, '');
  const now = nowMs();
  const windowStart = now - WINDOW_MS;

  await redis.zremrangebyscore(key, 0, windowStart);
  await redis.zadd(key, now, `${String(now)}-${String(Math.random())}`);
  const count = await redis.zcard(key);

  if (count >= LIMIT_NORMAL) {
    return { allowed: false, status: 'mute', count };
  }
  if (count >= THROTTLE_AT) {
    return { allowed: true, status: 'throttle', count };
  }
  if (count >= WARN_AT) {
    return { allowed: true, status: 'warn', count };
  }
  return { allowed: true, status: 'ok', count };
}

/**
 * DI-injectable rate limiter.
 */
export class RateLimiterMiddleware {
  private readonly redis: RateLimiterMiddlewareOptions['redis'];

  constructor(options: RateLimiterMiddlewareOptions) {
    this.redis = options.redis;
  }

  /**
   * Check rate limit for phone. When status is 'mute', caller should return 200 and send warm message.
   *
   * @param phone - E.164 phone number
   */
  async check(phone: string, nowMs?: () => number): Promise<RateLimitResult> {
    return checkRateLimit(this.redis, phone, nowMs);
  }
}

/** Warm WRDO message when rate limited (per issue P0-4). */
export const RATE_LIMIT_MESSAGE = 'Whoa, you are fast! Take a breath — we’re here.';
