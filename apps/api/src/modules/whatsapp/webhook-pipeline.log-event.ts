/**
 * Fire-and-forget event logging for the webhook pipeline.
 */

import { randomUUID } from 'node:crypto';
import type { IAiClient } from '../../clients/ai-client/ai-client';
import type { Intent } from '../../types/ai-client.types';

/**
 * Log a whatsapp.message_replied event via the AI client. Failures are silently ignored
 * to avoid breaking the pipeline.
 */
export function fireAndForgetLogEvent(
  aiClient: IAiClient,
  from: string,
  messageId: string,
  intent: Intent,
  nowFn: () => Date,
): void {
  aiClient
    .logEvent({
      eventId: randomUUID(),
      type: 'whatsapp.message_replied',
      payload: { phone: from, messageId, intent, replySent: true },
      timestamp: nowFn().toISOString(),
    })
    .catch(() => {
      // Fire-and-forget; do not fail the pipeline
    });
}
