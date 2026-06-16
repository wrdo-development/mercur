/**
 * Review flow orchestrator — conversational (text) fallback for users that
 * can't render Meta Flow JSON.
 *
 * The Meta Flow JSON is the primary UX (review-provider.flow.json /
 * review-resident.flow.json). The Flow Endpoint at
 * /webhooks/whatsapp-flow handles encrypted data_exchange there. This text
 * flow walks the same data collection sequentially for clients that don't
 * support Flows — older WhatsApp Business clients, debug sessions, the
 * dev runtime, etc.
 *
 * Step order:
 *   resident→provider:  rating → tags → comment → submit
 *   provider→resident:  rating → tags → comment → visibility → submit
 */

import type { ConversationState } from './conversation-state.service';
import { FAILURE_MESSAGES } from './failure-messages.constants';
import {
  PROVIDER_TO_RESIDENT_TAGS,
  RESIDENT_TO_PROVIDER_TAGS,
  REVIEW_FLOW_PROVIDER_TO_RESIDENT,
  REVIEW_FLOW_RESIDENT_TO_PROVIDER,
  REVIEW_PROMPTS,
  type ReviewFlowKind,
  type ReviewStep,
  type ReviewVisibility,
} from './review.flow.constants';
import {
  getPromptForReviewStep as getPromptForReviewStepBase,
  handleCollectComment,
  handleCollectRating,
  handleCollectSignalTags,
  handleCollectVisibility,
  type ReviewFlowResult,
} from './review.flow.helpers';

export type { ReviewFlowResult, ReviewSubmission } from './review.flow.helpers';

export interface ReviewFlowData {
  bookingId: string;
  authorKind: 'resident' | 'provider';
  subjectKind: 'resident' | 'provider';
  authorId: string;
  subjectId: string;
  authorName?: string;
  subjectName?: string;
  rating?: number;
  signalTags?: string[];
  comment?: string;
  visibility?: ReviewVisibility;
}

const CANCEL_TRIGGERS = new Set(['stop', 'cancel', 'quit', 'exit']);

const REVIEW_FLOW_KINDS = new Set<string>([
  REVIEW_FLOW_RESIDENT_TO_PROVIDER,
  REVIEW_FLOW_PROVIDER_TO_RESIDENT,
]);

/**
 * Build the initial conversation state for a review flow.
 */
export function makeInitialReviewState(
  flowKind: ReviewFlowKind,
  data: ReviewFlowData,
  nowIso: string = new Date().toISOString(),
): ConversationState {
  return {
    flow: flowKind,
    step: 'collect_rating' satisfies ReviewStep,
    data: { ...data, signalTags: [] },
    retriesLeft: 3,
    lastUpdatedAt: nowIso,
  };
}

/**
 * Build the friendly intro message (sent right before collect_rating).
 */
export function getReviewIntro(flowKind: ReviewFlowKind, subjectName: string): string {
  if (flowKind === REVIEW_FLOW_RESIDENT_TO_PROVIDER) {
    return REVIEW_PROMPTS.resident_to_provider.intro(subjectName);
  }
  return REVIEW_PROMPTS.provider_to_resident.intro(subjectName);
}

/**
 * Get the prompt for the current step. Enriches collect_signal_tags with
 * the tag list relevant to the flow direction.
 */
export function getPromptForReviewStep(flowKind: ReviewFlowKind, step: ReviewStep): string {
  if (step !== 'collect_signal_tags') {
    return getPromptForReviewStepBase(flowKind, step);
  }
  const tags =
    flowKind === REVIEW_FLOW_RESIDENT_TO_PROVIDER
      ? RESIDENT_TO_PROVIDER_TAGS
      : PROVIDER_TO_RESIDENT_TAGS;
  const base = getPromptForReviewStepBase(flowKind, step);
  return `${base}\n${tags
    .map((t) => `• ${t.replaceAll('_', ' ')}`)
    .join('\n')}\n\nReply with the tags you want, comma-separated, or "skip".`;
}

/**
 * Process a single step of the review flow.
 * Validates input, advances state, builds final submission when complete.
 */
export function processReviewStep(
  state: ConversationState,
  text: string,
  _messageType: string,
): ReviewFlowResult {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (CANCEL_TRIGGERS.has(lower)) {
    return {
      cleared: true,
      message: FAILURE_MESSAGES.cancel_mid_flow,
      ok: false,
    };
  }

  if (!REVIEW_FLOW_KINDS.has(state.flow)) {
    return { ok: false, message: 'Internal error: unknown review flow.', errorCode: 'bad_flow' };
  }
  const flowKind: ReviewFlowKind =
    state.flow === REVIEW_FLOW_PROVIDER_TO_RESIDENT
      ? REVIEW_FLOW_PROVIDER_TO_RESIDENT
      : REVIEW_FLOW_RESIDENT_TO_PROVIDER;

  const data: Record<string, unknown> = { ...state.data };
  const step = state.step as ReviewStep;

  if (step === 'collect_rating') {
    return handleCollectRating(state, data, trimmed, flowKind);
  }
  if (step === 'collect_signal_tags') {
    return handleCollectSignalTags(state, data, trimmed, lower, flowKind);
  }
  if (step === 'collect_comment') {
    return handleCollectComment(state, data, trimmed, lower, flowKind);
  }
  if (step === 'collect_visibility') {
    return handleCollectVisibility(state, data, lower, flowKind);
  }
  return { ok: false, message: 'Unknown step.', errorCode: 'unknown_step' };
}
