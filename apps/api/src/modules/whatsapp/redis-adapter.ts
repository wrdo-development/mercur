/**
 * Redis adapter for idempotency (and optionally rate limiter).
 * Uses REDIS_URL with ioredis when set; in-memory fallback when not (e.g. dev without Redis).
 */

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
  // + offline-queue-off so a Redis hiccup degrades instead of hammering; and an
  // 'error' handler so an unhandled ECONNRESET can't crash the whole backend
  // (the module is meant to degrade gracefully without Redis). (wrdo fork)
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    connectTimeout: 8000,
    retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 2000)),
  });
  redis.on('error', () => {
    /* swallow — degrade rather than crash; reads/writes will throw and callers handle */
  });
  sharedClient = {
    async del(key: string): Promise<unknown> {
      return redis.del(key);
    },
    async set(key: string, value: string, ...args: string[]): Promise<unknown> {
      return redis.set(key, value, ...args);
    },
    async get(key: string): Promise<string | null> {
      return redis.get(key);
    },
  };
  return sharedClient;
}
