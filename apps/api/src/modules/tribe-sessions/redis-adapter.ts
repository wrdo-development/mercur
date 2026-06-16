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
  ) => {
    del(key: string): Promise<number>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: string[]): Promise<string>;
  };
  const redis = new Redis(url);
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
