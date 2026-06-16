/**
 * Per-step helpers for review.flow.ts. Extracted to keep the orchestrator
 * file under the max-lines lint cap and to make each step independently
 * testable.
 */

import type { ConversationState } from './conversation-state.service';
import {
  isValidTagSet,
  normaliseSignalTag,
  REVIEW_COMMENT_MAX_LENGTH,
  REVIEW_FLOW_PROVIDER_TO_RESIDENT,
  REVIEW_FLOW_RESIDENT_TO_PROVIDER,
  REVIEW_PROMPTS,
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
  type ReviewFlowKind,
  type ReviewStep,
  type ReviewVisibility,
  tagsRequireLeaderTriage,
} from './review.flow.constants';

export interface ReviewSubmission {
  bookingId: string;
  authorKind: 'resident' | 'provider';
  subjectKind: 'resident' | 'provider';
  authorId: string;
  subjectId: string;
  authorName: string | null;
  rating: number;
  comment: string | null;
  signalTags: string[];
  visibility: ReviewVisibility;
}

export interface ReviewFlowResult {
  cleared?: boolean;
  errorCode?: string;
  message: string;
  nextState?: ConversationState;
  ok: boolean;
  submission?: ReviewSubmission;
}

export const SKIP_TRIGGERS = new Set(['skip', 'none', 'nothing']);

function safeString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function getPromptForReviewStep(flowKind: ReviewFlowKind, step: ReviewStep): string {
  const prompts =
    flowKind === REVIEW_FLOW_RESIDENT_TO_PROVIDER
      ? REVIEW_PROMPTS.resident_to_provider
      : REVIEW_PROMPTS.provider_to_resident;

  if (step === 'collect_rating') {
    return prompts.collect_rating;
  }
  if (step === 'collect_signal_tags') {
    return prompts.collect_signal_tags;
  }
  if (step === 'collect_comment') {
    return prompts.collect_comment;
  }
  if (step === 'collect_visibility' && flowKind === REVIEW_FLOW_PROVIDER_TO_RESIDENT) {
    return REVIEW_PROMPTS.provider_to_resident.collect_visibility;
  }
  return '';
}

export function handleCollectRating(
  state: ConversationState,
  data: Record<string, unknown>,
  trimmed: string,
  flowKind: ReviewFlowKind,
): ReviewFlowResult {
  const rating = Number.parseInt(trimmed, 10);
  if (Number.isNaN(rating) || rating < REVIEW_RATING_MIN || rating > REVIEW_RATING_MAX) {
    return {
      ok: false,
      message: `Please reply with a number from ${String(REVIEW_RATING_MIN)} to ${String(REVIEW_RATING_MAX)}.`,
      errorCode: 'invalid_rating',
    };
  }
  data['rating'] = rating;
  const nextStep: ReviewStep = 'collect_signal_tags';
  return {
    ok: true,
    message: getPromptForReviewStep(flowKind, nextStep),
    nextState: { ...state, step: nextStep, data, lastUpdatedAt: new Date().toISOString() },
  };
}

export function handleCollectSignalTags(
  state: ConversationState,
  data: Record<string, unknown>,
  trimmed: string,
  lower: string,
  flowKind: ReviewFlowKind,
): ReviewFlowResult {
  let tags: string[] = [];
  if (!SKIP_TRIGGERS.has(lower) && trimmed !== '') {
    tags = trimmed
      .split(/[,\n]/g)
      .map(normaliseSignalTag)
      .filter((t) => t.length > 0);
    const authorKind: 'provider' | 'resident' =
      flowKind === REVIEW_FLOW_PROVIDER_TO_RESIDENT ? 'provider' : 'resident';
    if (!isValidTagSet(tags, authorKind)) {
      return {
        ok: false,
        message:
          'Hmm, I didn\'t recognise some of those tags. Try copying them exactly from the list, or send "skip".',
        errorCode: 'invalid_tags',
      };
    }
  }
  data['signalTags'] = tags;
  const nextStep: ReviewStep = 'collect_comment';
  return {
    ok: true,
    message: getPromptForReviewStep(flowKind, nextStep),
    nextState: { ...state, step: nextStep, data, lastUpdatedAt: new Date().toISOString() },
  };
}

export function handleCollectComment(
  state: ConversationState,
  data: Record<string, unknown>,
  trimmed: string,
  lower: string,
  flowKind: ReviewFlowKind,
): ReviewFlowResult {
  const comment = SKIP_TRIGGERS.has(lower) || trimmed === '' ? null : trimmed;
  if (comment !== null && comment.length > REVIEW_COMMENT_MAX_LENGTH) {
    return {
      ok: false,
      message: `That's a bit long — keep it under ${String(REVIEW_COMMENT_MAX_LENGTH)} characters.`,
      errorCode: 'comment_too_long',
    };
  }
  data['comment'] = comment;

  if (flowKind === REVIEW_FLOW_PROVIDER_TO_RESIDENT) {
    const nextStep: ReviewStep = 'collect_visibility';
    return {
      ok: true,
      message: getPromptForReviewStep(flowKind, nextStep),
      nextState: { ...state, step: nextStep, data, lastUpdatedAt: new Date().toISOString() },
    };
  }

  return finalise(state, data, 'public', flowKind);
}

export function handleCollectVisibility(
  state: ConversationState,
  data: Record<string, unknown>,
  lower: string,
  flowKind: ReviewFlowKind,
): ReviewFlowResult {
  if (flowKind !== REVIEW_FLOW_PROVIDER_TO_RESIDENT) {
    return { ok: false, message: 'Internal error: unexpected step.', errorCode: 'bad_step' };
  }
  const visibility = parseVisibility(lower);
  if (visibility === null) {
    return {
      ok: false,
      message: 'Reply: PUBLIC, PROVIDERS, or LEADER (only Alwyn sees). Or send "stop" to cancel.',
      errorCode: 'invalid_visibility',
    };
  }
  return finalise(state, data, visibility, flowKind);
}

export function parseVisibility(input: string): ReviewVisibility | null {
  if (input === 'public' || input === 'everyone' || input === '1') {
    return 'public';
  }
  if (
    input === 'providers' ||
    input === 'providers_only' ||
    input === 'provider' ||
    input === '2'
  ) {
    return 'provider_only';
  }
  if (input === 'leader' || input === 'leader_only' || input === 'alwyn' || input === '3') {
    return 'leader_only';
  }
  return null;
}

export function finalise(
  state: ConversationState,
  data: Record<string, unknown>,
  chosenVisibility: ReviewVisibility,
  flowKind: ReviewFlowKind,
): ReviewFlowResult {
  const rawTags = data['signalTags'];
  const tags: string[] = Array.isArray(rawTags)
    ? rawTags.filter((t): t is string => typeof t === 'string')
    : [];
  const authorKind: 'provider' | 'resident' =
    flowKind === REVIEW_FLOW_PROVIDER_TO_RESIDENT ? 'provider' : 'resident';

  // Auto-escalate to leader_only when any tag is a serious dignity flag.
  let visibility: ReviewVisibility = chosenVisibility;
  if (tagsRequireLeaderTriage(tags, authorKind)) {
    visibility = 'leader_only';
  }

  const submission: ReviewSubmission = {
    bookingId: safeString(data['bookingId']),
    authorKind,
    subjectKind: authorKind === 'provider' ? 'resident' : 'provider',
    authorId: safeString(data['authorId']),
    subjectId: safeString(data['subjectId']),
    authorName: typeof data['authorName'] === 'string' ? data['authorName'] : null,
    rating: typeof data['rating'] === 'number' ? data['rating'] : 0,
    comment: typeof data['comment'] === 'string' ? data['comment'] : null,
    signalTags: tags,
    visibility,
  };

  const successMessage =
    flowKind === REVIEW_FLOW_RESIDENT_TO_PROVIDER
      ? REVIEW_PROMPTS.resident_to_provider.complete
      : REVIEW_PROMPTS.provider_to_resident.complete;

  return {
    ok: true,
    cleared: true,
    message: successMessage,
    submission,
    nextState: {
      ...state,
      step: 'complete' satisfies ReviewStep,
      data: { ...data, visibility },
      lastUpdatedAt: new Date().toISOString(),
    },
  };
}
