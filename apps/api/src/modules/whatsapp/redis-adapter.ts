/**
 * Redis adapter for idempotency (and optionally rate limiter).
 * Uses REDIS_URL with ioredis when set; in-memory fallback when not (e.g. dev without Redis).
 */

import { isQuotaError, RedisQuotaCircuitBreaker } from './redis-circuit-breaker';
import type { RedisAdapter } from './idempotency.service';

let sharedClient: {
  del(key: string): Promise<unknown>;
  set(key: string, value: string, ...args: string[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
} | null = null;

/**
 * In-memory adapter for when REDIS_URL is not set. Not suitable for multi-instance.
 *
 * @returns RedisAdapter
 */
function createMemoryAdapter(): RedisAdapter {
  const store = new Map<string, string>();
  return {
    async del(key: string): Promise<unknown> {
      store.delete(key);
      return await Promise.resolve(1);
    },
    async set(key: string, value: string, ...args: string[]): Promise<unknown> {
      const nx = args.includes('NX');
      if (nx && store.has(key)) {
        return await Promise.resolve(null);
      }
      store.set(key, value);
      return await Promise.resolve('OK');
    },
    async get(key: string): Promise<string | null> {
      return await Promise.resolve(store.get(key) ?? null);
    },
  };
}

/**
 * Create a Redis adapter from REDIS_URL. Uses ioredis when REDIS_URL is set;
 * otherwise returns an in-memory adapter (single-instance only).
 *
 * @returns RedisAdapter
 */
export function createRedisAdapter(): RedisAdapter {
  if (sharedClient !== null) {
    return sharedClient;
  }
  const url = process.env.REDIS_URL;
  if (url === undefined || url === '') {
    sharedClient = createMemoryAdapter();
    return sharedClient;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Redis = require('ioredis') as new (
    url: string,
    opts?: Record<string, unknown>,
  ) => {
    del(key: string): Promise<number>;
    set(key: string, value: string, ...args: string[]): Promise<string | null>;
    get(key: string): Promise<string | null>;
    on(event: string, cb: (err: unknown) => void): void;
  };
  // Hardened ioredis options (Upstash + Cloud): TLS is auto-enabled from a
  // rediss:// URL; lazyConnect avoids a connect storm at boot; bounded retries
  // so a Redis hiccup degrades instead of hammering; and an 'error' handler so
  // an unhandled ECONNRESET can't crash the whole backend (the module is meant
  // to degrade gracefully without Redis). (wrdo fork)
  //
  // enableOfflineQueue MUST be true here: with lazyConnect the connection is not
  // open until the first command, and offline-queue-off rejects any command
  // issued before the socket is writable with "Stream isn't writeable and
  // enableOfflineQueue options is false" — which is exactly the first webhook
  // message after boot. The offline queue buffers that first command and flushes
  // it once connected; maxRetriesPerRequest + connectTimeout still bound a truly
  // dead Redis so it degrades rather than hangs. (WRDO-169)
  // Quota circuit breaker (WRDO-180): a maxed-out Upstash returns
  // "ERR max requests limit exceeded" on EVERY command. That error is
  // deterministic — retrying or reconnecting cannot succeed, it only burns more
  // quota and spams logs. reconnectOnError suppresses the reconnect (so the
  // offline queue never replays doomed commands), and the breaker short-circuits
  // subsequent commands to the same degraded values a dead Redis already yields,
  // which every caller here already tolerates (idempotency → treat-as-new,
  // language profile → defaultProfile). When Redis is healthy the breaker is a
  // complete no-op.
  const breaker = new RedisQuotaCircuitBreaker();
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: true,
    connectTimeout: 8000,
    retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 2000)),
    // Do NOT reconnect on the quota error (reconnect + offline-queue replay is
    // the storm amplifier); reconnect normally for genuine connection errors.
    reconnectOnError: (err: Error): boolean => !isQuotaError(err),
  });
  redis.on('error', (err: unknown) => {
    // Trip the breaker on a quota error surfaced on the connection too, so the
    // very next command short-circuits instead of issuing another doomed request.
    breaker.recordError(err);
    /* otherwise swallow — degrade rather than crash; reads/writes will throw and callers handle */
  });
  sharedClient = {
    async del(key: string): Promise<unknown> {
      if (breaker.isOpen()) {
        return 0; // degraded: same as a dead-Redis del (callers ignore the value)
      }
      try {
        const result = await redis.del(key);
        breaker.recordSuccess();
        return result;
      } catch (err) {
        if (breaker.recordError(err)) {
          return 0; // quota error: degrade quietly, do NOT retry/throw (no storm)
        }
        throw err; // transient error: preserve existing throw/retry behavior
      }
    },
    async set(key: string, value: string, ...args: string[]): Promise<unknown> {
      if (breaker.isOpen()) {
        return 'OK'; // degraded: idempotency reads this as "treat as new" (process)
      }
      try {
        const result = await redis.set(key, value, ...args);
        breaker.recordSuccess();
        return result;
      } catch (err) {
        if (breaker.recordError(err)) {
          return 'OK';
        }
        throw err;
      }
    },
    async get(key: string): Promise<string | null> {
      if (breaker.isOpen()) {
        return null; // degraded: callers treat null as "no value" (empty/default)
      }
      try {
        const result = await redis.get(key);
        breaker.recordSuccess();
        return result;
      } catch (err) {
        if (breaker.recordError(err)) {
          return null;
        }
        throw err;
      }
    },
  };
  return sharedClient;
}
