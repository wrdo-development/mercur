/**
 * Utility functions for webhook pipeline parsing and message extraction.
 */

import type { WhatsAppMessage } from '../../types/whatsapp.types';
import { redactMessageId, redactPhone } from './whatsapp.logger';

/**
 * Extract message string and messageType from a WhatsApp message.
 *
 * @param msg - Incoming WhatsApp message
 * @returns { message: string, messageType: 'text' | 'image' | 'audio' | 'location' }
 */
export function getMessageTextAndType(msg: WhatsAppMessage): {
  message: string;
  messageType: 'text' | 'image' | 'audio' | 'location';
} {
  const type = msg.type;
  if (type === 'text' && msg.text?.body !== undefined && msg.text.body !== '') {
    return { message: msg.text.body, messageType: 'text' };
  }
  if (type === 'image') {
    return { message: msg.image?.caption ?? '[Image]', messageType: 'image' };
  }
  if (type === 'audio') {
    return { message: '[Voice message]', messageType: 'audio' };
  }
  if (type === 'location' && msg.location !== undefined) {
    const loc = msg.location;
    const parts = [loc.name, loc.address].filter((s): s is string => s !== undefined && s !== '');
    return {
      message: parts.length > 0 ? parts.join(' — ') : '[Location]',
      messageType: 'location',
    };
  }
  // At this point type is video | document | contacts | interactive | button | reaction | sticker | order | unknown
  return { message: '[Message]', messageType: 'text' as const };
}

/**
 * Try to extract first message from payload for redaction (when parse fails).
 *
 * @param payload - Raw webhook payload
 * @returns Redacted phone and messageId if extractable
 */
/* eslint-disable complexity -- defensive extraction mirrors Meta payload nesting */
export function tryExtractForParseError(payload: unknown): {
  phoneRedacted?: string;
  messageIdRedacted?: string;
} {
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return {};
  }
  const p = payload as { entry?: unknown[] };
  const entryArr = p.entry;
  if (!Array.isArray(entryArr) || entryArr.length === 0) {
    return {};
  }
  const entry = entryArr[0];
  if (entry === undefined || entry === null || typeof entry !== 'object' || !('changes' in entry)) {
    return {};
  }
  const changes = (entry as { changes?: unknown[] }).changes;
  if (!Array.isArray(changes) || changes.length === 0) {
    return {};
  }
  const change0 = changes[0];
  if (
    change0 === undefined ||
    change0 === null ||
    typeof change0 !== 'object' ||
    !('value' in change0)
  ) {
    return {};
  }
  const val = (change0 as { value: unknown }).value;
  if (val === undefined || val === null || typeof val !== 'object' || !('messages' in val)) {
    return {};
  }
  const messages = (val as { messages?: unknown[] }).messages;
  const first = Array.isArray(messages) ? messages[0] : undefined;
  if (first === undefined || typeof first !== 'object') {
    return {};
  }
  const msg = first as { from?: unknown; id?: unknown };
  return {
    ...(typeof msg.from === 'string' && { phoneRedacted: redactPhone(msg.from) }),
    ...(typeof msg.id === 'string' && { messageIdRedacted: redactMessageId(msg.id) }),
  };
}
/* eslint-enable complexity */
