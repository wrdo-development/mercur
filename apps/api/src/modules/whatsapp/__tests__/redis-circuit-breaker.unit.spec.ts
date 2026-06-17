/**
 * Unit tests for the Redis quota circuit breaker (WRDO-180).
 *
 * The breaker must:
 *  - open ONLY on the "max requests limit" quota error (case-insensitive),
 *  - short-circuit while open and within the cooldown window,
 *  - allow one probe through after the cooldown elapses,
 *  - NOT open on transient/non-quota errors (those keep their retry/throw path),
 *  - be a complete no-op until a quota error is recorded (happy path untouched).
 */

import {
  DEFAULT_COOLDOWN_MS,
  isQuotaError,
  RedisQuotaCircuitBreaker,
} from '../redis-circuit-breaker';

describe('isQuotaError (WRDO-180)', () => {
  it('matches the Upstash quota rejection message (case-insensitive)', () => {
    expect(isQuotaError(new Error('ERR max requests limit exceeded'))).toBe(true);
    expect(isQuotaError(new Error('ERR MAX REQUESTS LIMIT exceeded'))).toBe(true);
    expect(isQuotaError('ReplyError: ERR max requests limit exceeded')).toBe(true);
  });

  it('does NOT match transient / unrelated errors', () => {
    expect(isQuotaError(new Error('ECONNRESET'))).toBe(false);
    expect(isQuotaError(new Error('Connection is closed.'))).toBe(false);
    expect(isQuotaError(new Error('Stream isn\'t writeable'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });
});

describe('RedisQuotaCircuitBreaker (WRDO-180)', () => {
  it('is closed (no-op) before any error — happy path untouched', () => {
    const breaker = new RedisQuotaCircuitBreaker();
    expect(breaker.isOpen()).toBe(false);
  });

  it('opens on a quota error and short-circuits within the cooldown window', () => {
    let now = 1_000;
    const breaker = new RedisQuotaCircuitBreaker({ cooldownMs: 30_000, nowMs: () => now });

    const opened = breaker.recordError(new Error('ERR max requests limit exceeded'));
    expect(opened).toBe(true);
    expect(breaker.isOpen()).toBe(true);

    now = 1_000 + 29_999; // still inside cooldown
    expect(breaker.isOpen()).toBe(true);
  });

  it('does NOT open on a non-quota (transient) error', () => {
    const breaker = new RedisQuotaCircuitBreaker();
    const opened = breaker.recordError(new Error('ECONNRESET'));
    expect(opened).toBe(false);
    expect(breaker.isOpen()).toBe(false);
  });

  it('allows one probe through after the cooldown elapses', () => {
    let now = 1_000;
    const breaker = new RedisQuotaCircuitBreaker({ cooldownMs: 30_000, nowMs: () => now });
    breaker.recordError(new Error('ERR max requests limit exceeded'));
    expect(breaker.isOpen()).toBe(true);

    now = 1_000 + 30_000; // cooldown elapsed
    expect(breaker.isOpen()).toBe(false); // probe allowed
  });

  it('re-opens if the probe still hits the quota error', () => {
    let now = 1_000;
    const breaker = new RedisQuotaCircuitBreaker({ cooldownMs: 30_000, nowMs: () => now });
    breaker.recordError(new Error('ERR max requests limit exceeded'));

    now = 1_000 + 30_000;
    expect(breaker.isOpen()).toBe(false); // probe window

    // probe failed again → re-open
    breaker.recordError(new Error('ERR max requests limit exceeded'));
    expect(breaker.isOpen()).toBe(true);
  });

  it('fully resets on a successful command (Redis healthy again)', () => {
    let now = 1_000;
    const breaker = new RedisQuotaCircuitBreaker({ cooldownMs: 30_000, nowMs: () => now });
    breaker.recordError(new Error('ERR max requests limit exceeded'));
    expect(breaker.isOpen()).toBe(true);

    breaker.recordSuccess();
    expect(breaker.isOpen()).toBe(false);
  });

  it('defaults to a 30s cooldown', () => {
    expect(DEFAULT_COOLDOWN_MS).toBe(30_000);
  });
});
