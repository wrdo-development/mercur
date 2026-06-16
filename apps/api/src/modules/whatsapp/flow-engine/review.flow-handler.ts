/**
 * Review flow handler — walks a user through reviewing the OTHER party of a
 * recent booking. Two distinct flows:
 *
 *   - resident-reviewing-provider: rating + comment + signal_tags
 *   - provider-reviewing-resident: rating + comment + signal_tags + visibility
 *
 * Worker dignity is the load-bearing principle (memory:
 * project_wrdo_two_way_reviews.md). The provider-reviewing-resident copy is
 * deliberately warm and non-punitive — "How was working with X? Just a couple
 * quick tags help future providers".
 *
 * Trigger surface:
 *   - On booking completion, the post-completion job (review-prompt.job.ts)
 *     fires a WhatsApp Flow CTA to BOTH the resident and the provider.
 *   - The Flow JSON specs (review-provider.flow.json / review-resident.flow.json)
 *     drive the screens via Meta's data_exchange endpoint at
 *     /webhooks/whatsapp-flow.
 *   - This handler is the conversational (text) fallback path used by
 *     clients that can't render Flow JSON. It mirrors the same field set.
 *
 * Submission:
 *   - On completion, the handler emits a ReviewSubmission that the caller
 *     POSTs to /store/tribe/reviews/create with subject_kind / author_kind /
 *     visibility / signal_tags set.
 *   - Serious dignity-level signal_tags (wage_theft, discrimination,
 *     unsafe_environment) auto-escalate visibility to 'leader_only',
 *     overriding the user's choice — Alwyn ALWAYS sees those.
 */

import type {
  ConversationState,
  ConversationStateService,
} from '../../../modules/tribe-sessions/conversation-state.service';
import {
  getPromptForReviewStep,
  getReviewIntro,
  makeInitialReviewState,
  processReviewStep,
  type ReviewFlowData,
  type ReviewSubmission,
} from '../../../modules/tribe-sessions/review.flow';
// processReviewStep is used inside processInput below — keep the import.
import {
  REVIEW_FLOW_PROVIDER_TO_RESIDENT,
  REVIEW_FLOW_RESIDENT_TO_PROVIDER,
  type ReviewFlowKind,
} from '../../../modules/tribe-sessions/review.flow.constants';

export interface ReviewFlowHandlerOptions {
  conversationStateService: ConversationStateService;
}

export interface ProcessReviewInputResult {
  clearState?: boolean;
  message: string;
  nextState?: ConversationState;
  /** Set when the flow is complete; caller submits to /store/tribe/reviews/create. */
  submission?: ReviewSubmission;
}

/**
 * Walks a user through a review flow. Pure logic — no IO. Caller decides
 * whether to use the Meta Flow JSON path or the conversational fallback by
 * inspecting whether the user's WhatsApp client supports interactive=flow.
 */
export class ReviewFlowHandler {
  private readonly conversationStateService: ConversationStateService;

  constructor(options: ReviewFlowHandlerOptions) {
    this.conversationStateService = options.conversationStateService;
  }

  /**
   * Returns true when the supplied conversation state is a review flow.
   */
  static isReviewFlow(state: ConversationState | null): boolean {
    if (state === null) {
      return false;
    }
    return (
      state.flow === REVIEW_FLOW_RESIDENT_TO_PROVIDER ||
      state.flow === REVIEW_FLOW_PROVIDER_TO_RESIDENT
    );
  }

  /**
   * Start a resident-reviewing-provider review. Sets state and returns the
   * intro + first prompt joined together.
   */
  async startResidentReviewsProvider(
    phone: string,
    data: ReviewFlowData,
  ): Promise<{ intro: string; nextState: ConversationState; prompt: string }> {
    return this.start(REVIEW_FLOW_RESIDENT_TO_PROVIDER, phone, data);
  }

  /**
   * Start a provider-reviewing-resident review. Sets state and returns the
   * intro + first prompt joined together.
   */
  async startProviderReviewsResident(
    phone: string,
    data: ReviewFlowData,
  ): Promise<{ intro: string; nextState: ConversationState; prompt: string }> {
    return this.start(REVIEW_FLOW_PROVIDER_TO_RESIDENT, phone, data);
  }

  /**
   * Process input from a user mid-flow. Validates, advances state, returns
   * a message to send. When the flow completes, returns `submission` so the
   * caller can POST to /store/tribe/reviews/create.
   */
  async processInput(
    phone: string,
    state: ConversationState,
    text: string,
    messageType: string,
  ): Promise<ProcessReviewInputResult> {
    const result = processReviewStep(state, text, messageType);

    if (result.cleared === true) {
      await this.conversationStateService.clearState(phone);
      return {
        clearState: true,
        message: result.message,
        ...(result.submission !== undefined && { submission: result.submission }),
      };
    }

    if (result.ok && result.nextState) {
      await this.conversationStateService.setState(phone, result.nextState);
      return {
        message: result.message,
        nextState: result.nextState,
      };
    }

    return { message: result.message };
  }

  private async start(
    flowKind: ReviewFlowKind,
    phone: string,
    data: ReviewFlowData,
  ): Promise<{ intro: string; nextState: ConversationState; prompt: string }> {
    const state = makeInitialReviewState(flowKind, data);
    await this.conversationStateService.setState(phone, state);
    const subjectName = data.subjectName ?? 'them';
    const intro = getReviewIntro(flowKind, subjectName);
    const prompt = getPromptForReviewStep(flowKind, 'collect_rating');
    return { intro, nextState: state, prompt };
  }
}
