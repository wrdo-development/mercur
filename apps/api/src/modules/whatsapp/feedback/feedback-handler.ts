/**
 * Handle a WhatsApp reply-to-message feedback signal.
 *
 * Called from the webhook pipeline when context.message_id is present on an incoming message.
 * Stores in message_feedback (or confusion aggregate). Fire-and-forget safe — never throws.
 *
 * ⚠ Never assume Meta will serve back the original message text.
 *    Always retrieve from own message_logs. If evicted, store null.
 *    The reply text alone is still valuable signal.
 */
import { classifyFeedback, type FeedbackSignal } from './feedback-classifier';

export type { FeedbackSignal };

export interface FeedbackHandlerDeps {
  supabaseUrl: string;
  supabaseKey: string;
  /** Look up the body of a message we sent previously, by messageId. Returns null if not found. */
  getMessageBody: (messageId: string) => Promise<string | null>;
}

export interface IncomingFeedback {
  userId: string;
  quotedMsgId: string;
  replyText: string;
  langProfile?: Record<string, unknown> | null;
  correlationId?: string | null;
}

async function insertFeedback(
  deps: FeedbackHandlerDeps,
  row: {
    user_id: string;
    quoted_msg_id: string;
    quoted_msg_body: string | null;
    reply_text: string;
    signal_type: string;
    lang_profile: Record<string, unknown> | null;
    correlation_id: string | null;
  },
): Promise<void> {
  const url = `${deps.supabaseUrl}/rest/v1/message_feedback`;
  await fetch(url, {
    method: 'POST',
    headers: {
      apikey: deps.supabaseKey,
      Authorization: `Bearer ${deps.supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(5000),
  });
}

async function incrementConfusionCount(
  deps: FeedbackHandlerDeps,
  langCode: string,
  promptRef: string,
): Promise<void> {
  const url = `${deps.supabaseUrl}/rest/v1/message_confusion_counts`;
  await fetch(url, {
    method: 'POST',
    headers: {
      apikey: deps.supabaseKey,
      Authorization: `Bearer ${deps.supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      lang_code: langCode,
      prompt_ref: promptRef,
      count: 1,
      last_seen: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(5000),
  });
}

export async function handleFeedback(
  deps: FeedbackHandlerDeps,
  feedback: IncomingFeedback,
): Promise<void> {
  const quotedBody = await deps.getMessageBody(feedback.quotedMsgId).catch(() => null);
  const signal = classifyFeedback(feedback.replyText, quotedBody ?? '');
  const langCode = (feedback.langProfile?.['preferred'] as string | undefined) ?? 'en';

  if (signal === 'confusion') {
    // Confusion goes to the aggregate, not the review queue
    const promptRef = feedback.correlationId?.slice(0, 16) ?? 'unknown';
    await incrementConfusionCount(deps, langCode, promptRef).catch(() => {
      /* fire-and-forget */
    });
    return;
  }

  await insertFeedback(deps, {
    user_id: feedback.userId,
    quoted_msg_id: feedback.quotedMsgId,
    quoted_msg_body: quotedBody,
    reply_text: feedback.replyText,
    signal_type: signal,
    lang_profile: feedback.langProfile ?? null,
    correlation_id: feedback.correlationId ?? null,
  }).catch(() => {
    /* fire-and-forget */
  });
}
