/**
 * Idempotency for WhatsApp webhook messages (Meta → Tribe).
 * Uses Redis SETNX with idempotency:wa:{messageId}, TTL 24h.
 * Per ADR-001.
 */

const KEY_PREFIX = 'idempotency:wa:';
const TTL_SECONDS = 24 * 60 * 60; // 24 hours

export interface RedisAdapter {
  del(key: string): Promise<unknown>;
  set(key: string, value: string, ...args: string[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

export interface IdempotencyServiceOptions {
  redis: RedisAdapter;
}

/**
 * Returns true if the message is new (should process), false if duplicate (skip, return 200).
 */
export async function isNewMessage(redis: RedisAdapter, messageId: string): Promise<boolean> {
  const key = KEY_PREFIX + messageId;
  // SET key "processing" NX EX TTL → 'OK' if key was set, null if key already existed
  const result = await redis.set(key, 'processing', 'NX', 'EX', String(TTL_SECONDS));
  return result === 'OK' || result === true;
}

/**
 * Mark message as done (optional; keeps key until TTL for duplicate detection).
 */
export async function markDone(redis: RedisAdapter, messageId: string): Promise<void> {
  const key = KEY_PREFIX + messageId;
  await redis.set(key, 'done', 'EX', String(TTL_SECONDS));
}

/**
 * DI-injectable idempotency service.
 */
export class IdempotencyService {
  private readonly redis: RedisAdapter;

  constructor(options: IdempotencyServiceOptions) {
    this.redis = options.redis;
  }

  /**
   * Check if message is new. If true, caller should process. If false, return 200 and skip.
   *
   * @param messageId - Meta message.id
   * @returns true if new (process), false if duplicate (skip)
   */
  async isNew(messageId: string): Promise<boolean> {
    return isNewMessage(this.redis, messageId);
  }

  /**
   * Mark message processing as done (optional).
   */
  async markDone(messageId: string): Promise<void> {
    return markDone(this.redis, messageId);
  }
}
