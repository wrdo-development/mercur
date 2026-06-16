/**
 * Types, interfaces, and constants for the booking flow handler.
 */

import type { ProviderMatch } from '../../tribe-booking/provider-matcher.service';
import type {
  ConversationState,
  ConversationStateService,
} from '../../tribe-sessions/conversation-state.service';

export const PENDING_BOOKING_KEY_PREFIX = 'pending_booking:provider:';
export const PENDING_BOOKING_TTL_SECONDS = 14400; // 4 hours, matches timeout job

export const YES_CONFIRM_PATTERN =
  /^(yes|yeah|yep|ja|sure|ok|okay|10-4|sharp|lekker|deal|confirmed)\b/i;
export const NO_DECLINE_PATTERN = /^(no|nope|nah|decline|reject|cancel)\b/i;

export const PROVIDER_REPROMPT = 'Please reply YES or NO to confirm or decline this booking.';

export interface PendingBookingRedisAdapter {
  del(key: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: string[]): Promise<unknown>;
}

export interface PendingBookingPayload {
  bookingId: string;
  residentId: string;
  expiresAt: string;
}

export interface FindTopProvidersOptions {
  areaId: string;
  excludeProviderIds: string[];
  limit: number;
  serviceTypeInput: string;
}

export interface IBookingProviderFinder {
  findTopProviders(options: FindTopProvidersOptions): Promise<ProviderMatch[]>;
}

export interface BookingFlowHandlerOptions {
  conversationStateService: ConversationStateService;
  pendingBookingRedis: PendingBookingRedisAdapter;
  providerFinder: IBookingProviderFinder;
  getAreaForResident: (phone: string) => Promise<string | null>;
}

export type ProviderResponseAction =
  | 'confirmed'
  | 'no_decline'
  | 'provider_declined'
  | 'unrecognised'
  | 'yes_confirm';

export interface ProviderResponseResult {
  action?: ProviderResponseAction;
  bookingId?: string;
  handled: boolean;
  message?: string;
  residentId?: string;
}

export interface ProcessInputResult {
  clearState?: boolean;
  message: string;
  nextState?: ConversationState;
}
