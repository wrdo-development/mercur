/**
 * Redis adapter for ConversationStateService.
 * Requires get, set (with EX), del. Uses REDIS_URL with ioredis.
 */

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
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    // MUST be true with lazyConnect — see whatsapp/redis-adapter.ts (WRDO-169):
    // offline-queue-off rejects the first post-boot command before the socket
    // is writable; the offline queue buffers it until connected.
    enableOfflineQueue: true,
    connectTimeout: 8000,
    retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 2000)),
  });
  redis.on('error', () => {
    /* swallow — degrade rather than crash */
  });
  sharedAdapter = {
    async del(key: string): Promise<unknown> {
      return redis.del(key);
    },
    async get(key: string): Promise<string | null> {
      return redis.get(key);
    },
    async set(key: string, value: string, ...args: string[]): Promise<unknown> {
      return redis.set(key, value, ...args);
    },
  };
  return sharedAdapter;
}
