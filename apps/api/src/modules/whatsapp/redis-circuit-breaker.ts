/**
 * In-process circuit breaker for a quota-maxed Redis (WRDO-180).
 *
 * Root cause: when Upstash (free tier, 500k req/month) hits its cap, every
 * command returns `ReplyError: ERR max requests limit exceeded`. ioredis then
 * RETRIES the rejected command and the connection reconnect/offline-queue replay
 * amplifies one quota rejection into a storm of further rejected commands — each
 * a fresh request that burns more quota and spams the logs (31 identical errors
 * in one minute observed in prod).
 *
 * The fix is a deterministic-error breaker: a quota rejection is NOT transient
 * (retrying cannot succeed), so on the FIRST quota error we open the breaker for
 * a cooldown window and short-circuit all subsequent commands — returning the
 * SAME degraded values a dead Redis already produces (get→null, set→'OK', del→0)
 * WITHOUT issuing any further commands. After the cooldown one probe is allowed
 * through; if it still errors the breaker re-opens.
 *
 * This module is a pure, clock-injectable unit so it can be unit-tested without
 * a real Redis. It engages ONLY on the quota error — when Redis is healthy it is
 * a complete no-op (isOpen() is always false and recordSuccess() is a reset).
 */

/** Matches the Upstash/Redis quota rejection. Case-insensitive, substring. */
const QUOTA_ERROR_RE = /max requests limit/i;

/** Default cooldown the breaker stays open after a quota error. */
export const DEFAULT_COOLDOWN_MS = 30_000;

/**
 * Returns true if the given error is the Redis "max requests limit exceeded"
 * quota rejection (the deterministic error we must not retry).
 *
 * @param err - The error thrown by a Redis command or emitted on the connection
 * @returns true if the error message contains "max requests limit"
 */
export function isQuotaError(err: unknown): boolean {
  if (err === null || err === undefined) {
    return false;
  }
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err);
  return QUOTA_ERROR_RE.test(message);
}

/**
 * Tiny in-process breaker. Open for COOLDOWN_MS after a quota error; while open
 * callers short-circuit to degraded values. Clock injectable for tests.
 */
export class RedisQuotaCircuitBreaker {
  private openedAtMs: number | null = null;
  private readonly cooldownMs: number;
  private readonly nowMs: () => number;

  constructor(options?: { cooldownMs?: number; nowMs?: () => number }) {
    this.cooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.nowMs = options?.nowMs ?? ((): number => Date.now());
  }

  /**
   * Open the breaker IFF the error is the quota error. Non-quota (transient)
   * errors do NOT open it — those still propagate/retry as before.
   *
   * @param err - The error to evaluate
   * @returns true if this error opened (or kept open) the breaker
   */
  recordError(err: unknown): boolean {
    if (!isQuotaError(err)) {
      return false;
    }
    this.openedAtMs = this.nowMs();
    return true;
  }

  /**
   * Whether the breaker is currently open (within the cooldown window). Once the
   * cooldown elapses this returns false so exactly one probe command is allowed
   * through; if that probe errors again recordError re-opens the breaker.
   *
   * @returns true if commands should short-circuit to degraded values
   */
  isOpen(): boolean {
    if (this.openedAtMs === null) {
      return false;
    }
    if (this.nowMs() - this.openedAtMs >= this.cooldownMs) {
      // Cooldown elapsed: let one probe through (stay "armed" — a fresh quota
      // error will re-open via recordError).
      this.openedAtMs = null;
      return false;
    }
    return true;
  }

  /**
   * A command succeeded — Redis is healthy again, fully reset the breaker.
   */
  recordSuccess(): void {
    this.openedAtMs = null;
  }
}
