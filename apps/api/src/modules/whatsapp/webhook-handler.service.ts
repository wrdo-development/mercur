/**
 * Parses incoming WhatsApp webhook payloads and extracts messages.
 * Supports text, image, audio, location, interactive, button.
 */

import type {
  WhatsAppChangeValue,
  WhatsAppContact,
  WhatsAppMessage,
} from '../../types/whatsapp.types';

export interface IdentityPair {
  phone: string;
  bsuid: string;
}

export interface ParsedWebhookResult {
  messages: WhatsAppMessage[];
  contactName: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string;
  /**
   * Business Solution User Identifier preferred when Meta sends it. Falls
   * back to `wa_id` for backwards compatibility (Meta's 2026-06 migration).
   * Null only when neither field is present, which Meta should never do.
   */
  bsuid: string | null;
  /**
   * Present when a contact carries BOTH a phone-shaped `wa_id` AND a `user_id`
   * (BSUID). Consumers should persist this pairing via
   * `TribeUserService.updateBsuidByPhone` so the user remains matchable after
   * 2026-07-07 when WhatsApp username waves remove phones from webhooks.
   *
   * Null when only one identifier is present (legacy-only or username-only era).
   */
  identityPair: IdentityPair | null;
}

/**
 * Pull the Business Solution User Identifier out of a Meta contact entry.
 * Prefers `user_id` (BSUID, post-2026-06) and falls back to legacy `wa_id`.
 *
 * Deliberately applies no BSUID_PATTERN guard — returns any identifier present,
 * including a BSUID-shaped `wa_id`. This is intentional: callers that need a
 * confirmed phone↔BSUID pair should use {@link extractIdentityPair} instead,
 * which enforces the phone-shape guard on `wa_id`.
 *
 * @internal exported for direct unit-testing
 */
export function extractBsuid(contact: WhatsAppContact | undefined): string | null {
  if (contact === undefined) {
    return null;
  }
  const userId = contact.user_id;
  if (typeof userId === 'string' && userId.length > 0) {
    return userId;
  }
  const waId = contact.wa_id;
  if (typeof waId === 'string' && waId.length > 0) {
    return waId;
  }
  return null;
}

/**
 * Regex that matches a BSUID: two uppercase letters followed by a dot, e.g. "ZA.AbC123".
 * Meta MAY send a BSUID in `wa_id` for username users — guard so we never
 * treat a BSUID-shaped wa_id as a phone number.
 */
const BSUID_PATTERN = /^[A-Z]{2}\./;

/**
 * Extract a phone↔BSUID identity pair from a contact entry.
 *
 * Returns a pair only when ALL of the following hold:
 *   - `wa_id` is present, non-empty, and does NOT match BSUID_PATTERN (phone-shaped).
 *   - `user_id` is present and non-empty.
 *
 * Returns null in all other cases (legacy-only, username-only, BSUID in wa_id).
 *
 * @internal exported for direct unit-testing
 */
export function extractIdentityPair(contact: WhatsAppContact | undefined): IdentityPair | null {
  if (contact === undefined) {
    return null;
  }
  const waId = contact.wa_id;
  const userId = contact.user_id;
  if (typeof waId !== 'string' || waId.length === 0 || BSUID_PATTERN.test(waId)) {
    return null;
  }
  if (typeof userId !== 'string' || userId.length === 0) {
    return null;
  }
  return { phone: waId, bsuid: userId };
}

/**
 * Webhook handler service. Parses Meta webhook payloads.
 * DI-injectable; no global state.
 */
export class WebhookHandlerService {
  /**
   * Parse a webhook payload and return all messages from the first entry.
   *
   * @param payload - Raw payload from Meta (must be WhatsAppWebhookPayload shape)
   * @returns Parsed messages and metadata, or null if payload is invalid/empty
   */
  /* eslint-disable complexity -- Meta webhook payload shape is branchy */
  parsePayload(payload: unknown): ParsedWebhookResult | null {
    if (payload === null || payload === undefined || typeof payload !== 'object') {
      return null;
    }

    const p = payload as Record<string, unknown>;
    if (p.object !== 'whatsapp_business_account') {
      return null;
    }

    const entryArr = p.entry;
    if (!Array.isArray(entryArr) || entryArr.length === 0) {
      return null;
    }
    const entry: unknown = entryArr[0];
    if (entry === undefined || typeof entry !== 'object') {
      return null;
    }

    const changes = (entry as Record<string, unknown>).changes;
    if (!Array.isArray(changes) || changes.length === 0) {
      return null;
    }

    const change: unknown = changes[0];
    if (change === undefined || typeof change !== 'object') {
      return null;
    }
    const changeObj = change as Record<string, unknown>;
    if (changeObj.field !== 'messages') {
      return null;
    }

    const value = changeObj.value;
    if (value === undefined || typeof value !== 'object') {
      return null;
    }
    const valueObj = value as Record<string, unknown>;
    if (valueObj.messaging_product !== 'whatsapp') {
      return null;
    }

    const typedValue = value as WhatsAppChangeValue;
    const messages = typedValue.messages ?? [];
    const contacts = typedValue.contacts;
    const firstContact = Array.isArray(contacts) ? contacts[0] : undefined;
    const contactName =
      firstContact !== undefined &&
      typeof firstContact === 'object' &&
      'profile' in firstContact &&
      (firstContact as { profile?: { name?: string } }).profile?.name !== undefined
        ? (firstContact as { profile: { name: string } }).profile.name
        : null;
    const bsuid = extractBsuid(firstContact);
    const identityPair = extractIdentityPair(firstContact);

    const metadata = typedValue.metadata;
    const phoneNumberId = metadata.phone_number_id;
    const displayPhoneNumber = metadata.display_phone_number;

    return {
      messages,
      contactName,
      phoneNumberId,
      displayPhoneNumber,
      bsuid,
      identityPair,
    };
  }
  /* eslint-enable complexity */

  /**
   * Extract the first message from a parsed result for convenience.
   *
   * @param result - Result from parsePayload
   * @returns First message or undefined
   */
  getFirstMessage(result: ParsedWebhookResult | null): WhatsAppMessage | undefined {
    if (result === null) {
      return undefined;
    }
    const messages = result.messages;
    return Array.isArray(messages) ? messages[0] : undefined;
  }
}
