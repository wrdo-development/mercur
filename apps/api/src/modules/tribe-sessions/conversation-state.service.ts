/**
 * Redis-backed multi-step conversation state for registration and feedback flows.
 * TTL 2 hours. Grace period: stale state returns with isStale flag (no auto-clear).
 *
 * Supported flows: registration, booking (see booking.flow.ts).
 */

import type { ConversationState } from './types';

export type { ConversationState } from './types';

/** Flow identifier for booking flow. Used by BookingFlowHandler. */
export const BOOKING_FLOW = 'booking';

/**
 * Check if conversation state is in booking flow.
 *
 * @param state - Conversation state or null
 * @returns true if state is booking flow
 */
export function isBookingFlow(state: ConversationState | null): boolean {
  return state !== null && state.flow === BOOKING_FLOW;
}

export const REGISTRATION_FLOW = 'registration';

export function isRegistrationFlow(state: ConversationState | null): boolean {
  return state !== null && state.flow === REGISTRATION_FLOW;
}

export type ConversationStateWithStale = ConversationState & { isStale?: true };

/** Redis adapter for conversation state: get, set (with EX), del. */
export interface ConversationStateRedisAdapter {
  del(key: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: string[]): Promise<unknown>;
}

const KEY_PREFIX = 'conv_state:';
const TTL_SECONDS = 2 * 60 * 60; // 2 hours
const STALE_THRESHOLD_MS = TTL_SECONDS * 1000;

export interface ConversationStateServiceOptions {
  redis: ConversationStateRedisAdapter;
  /** Override system clock. Defaults to Date.now(). Use in tests for deterministic time. */
  nowMs?: () => number;
}

/**
 * Get conversation state for a phone number.
 * If state exists but lastUpdatedAt is older than 2h, returns state with isStale: true.
 * Does NOT clear state automatically.
 *
 * @param phone - WhatsApp phone number (E.164)
 * @returns State with optional isStale, or null if no state
 */
export async function getState(
  redis: ConversationStateRedisAdapter,
  phone: string,
  nowMs: () => number = () => Date.now(),
): Promise<ConversationStateWithStale | null> {
  const key = KEY_PREFIX + phone;
  const raw = await redis.get(key);
  if (raw === null || raw === '') {
    return null;
  }
  try {
    const state = JSON.parse(raw) as ConversationState;
    const lastMs = new Date(state.lastUpdatedAt).getTime();
    const isStale = nowMs() - lastMs > STALE_THRESHOLD_MS;
    return { ...state, ...(isStale && { isStale: true }) };
  } catch {
    return null;
  }
}

/**
 * Set conversation state with 2h TTL.
 * Updates lastUpdatedAt to current time on every call.
 *
 * @param phone - WhatsApp phone number
 * @param state - State to persist (lastUpdatedAt overwritten)
 */
export async function setState(
  redis: ConversationStateRedisAdapter,
  phone: string,
  state: ConversationState,
  nowMs: () => number = () => Date.now(),
): Promise<void> {
  const key = KEY_PREFIX + phone;
  const normalized: ConversationState = {
    ...state,
    lastUpdatedAt: new Date(nowMs()).toISOString(),
  };
  const value = JSON.stringify(normalized);
  await redis.set(key, value, 'EX', String(TTL_SECONDS));
}

/**
 * Clear conversation state (on completion or cancel).
 *
 * @param phone - WhatsApp phone number
 */
export async function clearState(
  redis: ConversationStateRedisAdapter,
  phone: string,
): Promise<void> {
  const key = KEY_PREFIX + phone;
  await redis.del(key);
}

/**
 * DI-injectable conversation state service.
 */
export class ConversationStateService {
  private readonly redis: ConversationStateRedisAdapter;
  private readonly nowMs: () => number;

  constructor(options: ConversationStateServiceOptions) {
    this.redis = options.redis;
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  async getState(phone: string): Promise<ConversationStateWithStale | null> {
    return getState(this.redis, phone, this.nowMs);
  }

  async setState(phone: string, state: ConversationState): Promise<void> {
    return setState(this.redis, phone, state, this.nowMs);
  }

  async clearState(phone: string): Promise<void> {
    return clearState(this.redis, phone);
  }
}
