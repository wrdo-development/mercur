/**
 * Redis adapter for ConversationStateService.
 * Requires get, set (with EX), del. Uses REDIS_URL with ioredis.
 */

import {
  isQuotaError,
  RedisQuotaCircuitBreaker,
} from '../whatsapp/redis-circuit-breaker';
import type { ConversationStateRedisAdapter } from './conversation-state.service';

let sharedAdapter: ConversationStateRedisAdapter | null = null;

function createMemoryAdapter(): ConversationStateRedisAdapter {
  const store = new Map<string, string>();
  return {
    async del(key: string): Promise<unknown> {
      store.delete(key);
      return Promise.resolve(1);
    },
    async get(key: string): Promise<string | null> {
      return Promise.resolve(store.get(key) ?? null);
    },
    async set(key: string, value: string, ..._args: string[]): Promise<unknown> {
      store.set(key, value);
      return Promise.resolve('OK');
    },
  };
}

/**
 * Create Redis adapter for conversation state. Uses REDIS_URL when set.
 *
 * @returns ConversationStateRedisAdapter
 */
export function createConversationStateRedisAdapter(): ConversationStateRedisAdapter {
  if (sharedAdapter !== null) {
    return sharedAdapter;
  }
  const url = process.env.REDIS_URL;
  if (url === undefined || url === '') {
    sharedAdapter = createMemoryAdapter();
    return sharedAdapter;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Redis = require('ioredis') as new (
    u: string,
    opts?: Record<string, unknown>,
  ) => {
    del(key: string): Promise<number>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: string[]): Promise<string>;
    on(event: string, cb: (err: unknown) => void): void;
  };
  // Hardened ioredis options — see whatsapp/redis-adapter.ts. TLS auto from
  // rediss://, lazyConnect, bounded retries, 'error' handler so a Redis failure
  // degrades instead of crashing boot. (wrdo fork)
  // Quota circuit breaker (WRDO-180) — identical rationale to
  // whatsapp/redis-adapter.ts: a maxed Upstash returns "ERR max requests limit
  // exceeded" on every command; retrying/reconnecting only amplifies the storm.
  // Short-circuit to the degraded values conversation-state already tolerates
  // (get→null = "no state" = degrade to empty/in-memory; set/del = no-op the
  // caller ignores). No-op when Redis is healthy.
  const breaker = new RedisQuotaCircuitBreaker();
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    // MUST be true with lazyConnect — see whatsapp/redis-adapter.ts (WRDO-169):
    // offline-queue-off rejects the first post-boot command before the socket
    // is writable; the offline queue buffers it until connected.
    enableOfflineQueue: true,
    connectTimeout: 8000,
    retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 2000)),
    // Do NOT reconnect on the quota error (reconnect + offline-queue replay is
    // the storm amplifier); reconnect normally for genuine connection errors.
    reconnectOnError: (err: Error): boolean => !isQuotaError(err),
  });
  redis.on('error', (err: unknown) => {
    breaker.recordError(err);
    /* otherwise swallow — degrade rather than crash */
  });
  sharedAdapter = {
    async del(key: string): Promise<unknown> {
      if (breaker.isOpen()) {
        return 0; // degraded: dead-Redis del (caller ignores the value)
      }
      try {
        const result = await redis.del(key);
        breaker.recordSuccess();
        return result;
      } catch (err) {
        if (breaker.recordError(err)) {
          return 0; // quota error: degrade quietly, no retry/throw (no storm)
        }
        throw err; // transient: preserve existing throw/retry behavior
      }
    },
    async get(key: string): Promise<string | null> {
      if (breaker.isOpen()) {
        return null; // degraded: getState reads null as "no state" → in-memory/empty
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
    async set(key: string, value: string, ...args: string[]): Promise<unknown> {
      if (breaker.isOpen()) {
        return 'OK'; // degraded: caller ignores set's return value
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
  };
  return sharedAdapter;
}
