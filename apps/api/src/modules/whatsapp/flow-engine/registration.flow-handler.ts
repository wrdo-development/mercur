/**
 * Registration flow handler.
 * Routes mid-flow messages to RegistrationFlow; manages ConversationStateService.
 */

import type {
  ConversationState,
  ConversationStateService,
} from '../../../modules/tribe-sessions/conversation-state.service';
import {
  buildConfirmNamePrompt,
  getPromptForStep,
  processRegistrationStep,
} from '../../../modules/tribe-sessions/registration.flow';

/**
 * Data collected over the registration flow, handed to onRegistrationComplete
 * when the user consents. All fields are best-effort — selfie/location are
 * optional, interests may be empty.
 */
export interface CompletedRegistration {
  phone: string;
  name?: string;
  role?: string;
  interests?: string[];
  selfieProvided?: boolean;
  locationProvided?: boolean;
}

/**
 * Persistence hook fired once, best-effort, when registration completes (consent
 * given). MUST NOT throw out — the handler swallows errors so a DB hiccup never
 * blocks the friend's "You're all set!" (idempotent retry happens on their next
 * message). Optional: when absent, completion is a clean no-op (Step-1 behaviour).
 */
export type OnRegistrationComplete = (data: CompletedRegistration) => Promise<void>;

export interface RegistrationFlowHandlerOptions {
  conversationStateService: ConversationStateService;
  onRegistrationComplete?: OnRegistrationComplete;
}

const REGISTRATION_TRIGGERS = ['register', 'sign up', 'signup', 'join', 'hi', 'hey', 'hello'];

/**
 * Handler for registration flow. Gets state, processes input, returns message(s) to send.
 */
export class RegistrationFlowHandler {
  private readonly conversationStateService: ConversationStateService;
  private readonly onRegistrationComplete?: OnRegistrationComplete;

  constructor(options: RegistrationFlowHandlerOptions) {
    this.conversationStateService = options.conversationStateService;
    this.onRegistrationComplete = options.onRegistrationComplete;
  }

  /**
   * Check if message text triggers starting registration when no state exists.
   */
  static isRegistrationTrigger(text: string): boolean {
    const t = text.trim().toLowerCase();
    return REGISTRATION_TRIGGERS.some((trigger) => t === trigger || t.startsWith(`${trigger} `));
  }

  /**
   * Create initial registration state and return first prompt.
   *
   * Confirm-not-collect (WRDO-169): when we already know the WhatsApp profile
   * name we open by confirming it ("You're Thabo, right?") instead of asking
   * cold. When no name is available we fall back to the cold collect_name path.
   *
   * @param phone - WhatsApp phone number
   * @param contactName - Name from contacts[].profile.name, if present
   * @returns First prompt message
   */
  async startRegistration(phone: string, contactName?: string | null): Promise<string> {
    // Never clobber an in-progress registration. A re-greeting ("hi"/"hey") or
    // a stray 'register' classification must not reset someone who is already
    // partway through — that silently wiped their name/role and desynced the
    // screen from the state machine (WRDO-169 follow-up: restart loops). If a
    // registration is already live, resume by re-prompting the current step.
    const existing = await this.conversationStateService.getState(phone);
    if (existing !== null && existing.flow === 'registration') {
      if (existing.step === 'confirm_name' && typeof existing.data.name === 'string') {
        return buildConfirmNamePrompt(existing.data.name);
      }
      return getPromptForStep(existing.step);
    }

    const knownName = typeof contactName === 'string' ? contactName.trim() : '';
    if (knownName.length >= 2) {
      const confirmState: ConversationState = {
        flow: 'registration',
        step: 'confirm_name',
        data: { name: knownName },
        retriesLeft: 3,
        lastUpdatedAt: new Date().toISOString(),
      };
      await this.conversationStateService.setState(phone, confirmState);
      return buildConfirmNamePrompt(knownName);
    }

    const initialState: ConversationState = {
      flow: 'registration',
      step: 'collect_name',
      data: {},
      retriesLeft: 3,
      lastUpdatedAt: new Date().toISOString(),
    };
    await this.conversationStateService.setState(phone, initialState);
    return getPromptForStep('collect_name');
  }

  /**
   * Process input for a user in registration flow.
   *
   * @param phone - WhatsApp phone number
   * @param state - Current conversation state (with optional isStale)
   * @param text - User message text
   * @param messageType - Message type
   * @returns Message to send; caller updates/clears state
   */
  async processInput(
    phone: string,
    state: ConversationState,
    text: string,
    messageType: string,
  ): Promise<{
    clearState?: boolean;
    message: string;
    nextState?: ConversationState;
  }> {
    const result = processRegistrationStep(state, text, messageType);

    if (result.cleared === true) {
      // Persist on completion (consent given) before clearing. Best-effort:
      // a write failure must never block the welcome — getOrCreate is idempotent
      // so the next message retries cleanly (confirmed design, WRDO-179).
      if (result.completed === true) {
        await this.persistOnComplete(phone, state);
      }
      await this.conversationStateService.clearState(phone);
      return { clearState: true, message: result.message };
    }

    if (result.ok && result.nextState) {
      await this.conversationStateService.setState(phone, result.nextState);
      return {
        message: result.message,
        nextState: result.nextState,
      };
    }

    return {
      message: result.message,
    };
  }

  /**
   * Fire the persistence hook with the collected data, swallowing any error.
   * Best-effort by design (WRDO-179): the friend always gets "You're all set!"
   * even if the write fails; the idempotent getOrCreate retries on their next
   * message. The error is logged to the console stream so it stays diagnosable.
   */
  private async persistOnComplete(phone: string, state: ConversationState): Promise<void> {
    if (this.onRegistrationComplete === undefined) {
      return;
    }
    const data = state.data as {
      name?: unknown;
      role?: unknown;
      interests?: unknown;
      selfieProvided?: unknown;
      locationProvided?: unknown;
    };
    try {
      await this.onRegistrationComplete({
        phone,
        name: typeof data.name === 'string' ? data.name : undefined,
        role: typeof data.role === 'string' ? data.role : undefined,
        interests: Array.isArray(data.interests)
          ? data.interests.filter((i): i is string => typeof i === 'string')
          : undefined,
        selfieProvided: typeof data.selfieProvided === 'boolean' ? data.selfieProvided : undefined,
        locationProvided:
          typeof data.locationProvided === 'boolean' ? data.locationProvided : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[whatsapp] registration persist failed (best-effort):', msg);
    }
  }
}
