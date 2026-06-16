/**
 * Utility functions for the booking flow handler.
 */

import type { ProviderMatch } from '../../tribe-booking/provider-matcher.service';
import {
  NO_DECLINE_PATTERN,
  PENDING_BOOKING_KEY_PREFIX,
  PENDING_BOOKING_TTL_SECONDS,
  type PendingBookingPayload,
  type PendingBookingRedisAdapter,
  PROVIDER_REPROMPT,
  type ProviderResponseResult,
  YES_CONFIRM_PATTERN,
} from './booking.flow-handler.types';

/**
 * Format provider options for display in WhatsApp message.
 */
export function formatProviderOptions(providers: ProviderMatch[]): string {
  const lines = providers.map((p, i) => {
    const rating = typeof p.average_rating === 'number' ? ` (${String(p.average_rating)}★)` : '';
    return `${String(i + 1)}. ${p.name ?? 'Provider'}${rating}`;
  });
  return `Reply 1, 2 or 3 to choose your provider:\n\n${lines.join('\n')}`;
}

/**
 * Get pending booking for provider phone from Redis.
 */
export async function getPendingBooking(
  redis: PendingBookingRedisAdapter,
  providerPhone: string,
): Promise<PendingBookingPayload | null> {
  const key = PENDING_BOOKING_KEY_PREFIX + providerPhone;
  const raw = await redis.get(key);
  if (raw === null || raw === '') {
    return null;
  }
  try {
    return JSON.parse(raw) as PendingBookingPayload;
  } catch {
    return null;
  }
}

/**
 * Set pending booking key when booking moves to provider_sent.
 * TTL 4h to match timeout job.
 */
export async function setPendingBooking(
  redis: PendingBookingRedisAdapter,
  providerPhone: string,
  payload: PendingBookingPayload,
): Promise<void> {
  const key = PENDING_BOOKING_KEY_PREFIX + providerPhone;
  const value = JSON.stringify(payload);
  await redis.set(key, value, 'EX', String(PENDING_BOOKING_TTL_SECONDS));
}

/**
 * Clear pending booking key when provider responds.
 */
export async function clearPendingBooking(
  redis: PendingBookingRedisAdapter,
  providerPhone: string,
): Promise<void> {
  const key = PENDING_BOOKING_KEY_PREFIX + providerPhone;
  await redis.del(key);
}

/**
 * Handle provider response when pending_booking key exists.
 * Tier 0: yes_confirm -> confirmed, no_decline -> provider_declined, else re-prompt.
 */
export async function handleProviderResponseLogic(
  redis: PendingBookingRedisAdapter,
  providerPhone: string,
  text: string,
): Promise<ProviderResponseResult> {
  const pending = await getPendingBooking(redis, providerPhone);
  if (pending === null) {
    return { handled: false };
  }

  const trimmed = text.trim().toLowerCase();
  if (YES_CONFIRM_PATTERN.test(trimmed)) {
    await clearPendingBooking(redis, providerPhone);
    return {
      action: 'yes_confirm',
      bookingId: pending.bookingId,
      handled: true,
      residentId: pending.residentId,
    };
  }
  if (NO_DECLINE_PATTERN.test(trimmed)) {
    await clearPendingBooking(redis, providerPhone);
    return {
      action: 'no_decline',
      bookingId: pending.bookingId,
      handled: true,
      residentId: pending.residentId,
    };
  }

  return {
    action: 'unrecognised',
    handled: true,
    message: PROVIDER_REPROMPT,
  };
}
