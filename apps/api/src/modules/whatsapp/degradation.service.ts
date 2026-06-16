/**
 * Degradation messages when the AI call is slow, down, or errors.
 *
 * P0-6: Graceful degradation — WRDO voice messages for timeout, 500, unreachable, rate limit.
 */

export type DegradationReason = 'timeout' | 'upstream_error' | 'unreachable' | 'rate_limited';

/**
 * AI-call timeout threshold in milliseconds.
 * AI-call timeout > this value → warm holding message.
 */
export const CAVE_TIMEOUT_MS = 5000;

const MESSAGES: Record<DegradationReason, string> = {
  unreachable: 'Hey! I am just catching my breath — give me a moment 💨',
  timeout: 'Working on that for you... one sec! ⏳',
  upstream_error: 'Hmm, something went sideways. Can you try again? 🙋',
  rate_limited: 'Whoa, you are fast! Give me a second to catch up 😅',
};

/**
 * Default message when AI killswitch is on (Tier 0 only, no AI call).
 */
export const TIER0_DEFAULT_MESSAGE = 'Hey! How can I help you today? 💬';

/**
 * Returns the WRDO-voice message for a given degradation reason.
 *
 * @param reason - Why the AI call was not used (timeout, error, unreachable, rate limit)
 * @returns User-facing message in WRDO personality
 */
export function getMessageFor(reason: DegradationReason): string {
  switch (reason) {
    case 'unreachable':
      return MESSAGES.unreachable;
    case 'timeout':
      return MESSAGES.timeout;
    case 'upstream_error':
      return MESSAGES.upstream_error;
    case 'rate_limited':
      return MESSAGES.rate_limited;
    default:
      return MESSAGES.upstream_error;
  }
}

/**
 * Service that provides graceful degradation messages.
 * DI-injectable for tests.
 */
export class DegradationService {
  static readonly CAVE_TIMEOUT_MS = CAVE_TIMEOUT_MS;

  /**
   * Returns the WRDO-voice message for a given degradation reason.
   *
   * @param reason - Why the AI call was not used
   * @returns User-facing message in WRDO personality
   */
  getMessageFor(reason: DegradationReason): string {
    return getMessageFor(reason);
  }

  /**
   * Returns the Tier 0 default message when AI is disabled (killswitch on).
   *
   * @returns Default greeting / fallback message
   */
  getTier0DefaultMessage(): string {
    return TIER0_DEFAULT_MESSAGE;
  }
}
