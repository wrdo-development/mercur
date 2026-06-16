/**
 * Tribe Sessions module types.
 * Multi-step conversation state for registration and feedback flows.
 */

/**
 * Conversation state persisted in Redis with 2h TTL.
 * lastUpdatedAt is set on every setState call.
 */
export interface ConversationState {
  flow: string;
  step: string;
  data: Record<string, unknown>;
  retriesLeft: number;
  lastUpdatedAt: string;
}

/**
 * Conversation state as returned by getState.
 * When now - lastUpdatedAt > 2h, includes isStale: true.
 * Service does NOT auto-clear; caller sends warm welcome and handles YES/NO.
 */
export type ConversationStateResult = ConversationState & { isStale?: boolean };
