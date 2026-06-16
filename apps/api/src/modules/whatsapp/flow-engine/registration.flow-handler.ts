/**
 * Registration flow handler.
 * Routes mid-flow messages to RegistrationFlow; manages ConversationStateService.
 */

import type {
  ConversationState,
  ConversationStateService,
} from '../../../modules/tribe-sessions/conversation-state.service';
import {
  getPromptForStep,
  processRegistrationStep,
} from '../../../modules/tribe-sessions/registration.flow';

export interface RegistrationFlowHandlerOptions {
  conversationStateService: ConversationStateService;
}

const REGISTRATION_TRIGGERS = ['register', 'sign up', 'signup', 'join', 'hi', 'hey', 'hello'];

/**
 * Handler for registration flow. Gets state, processes input, returns message(s) to send.
 */
export class RegistrationFlowHandler {
  private readonly conversationStateService: ConversationStateService;

  constructor(options: RegistrationFlowHandlerOptions) {
    this.conversationStateService = options.conversationStateService;
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
   * @param phone - WhatsApp phone number
   * @returns First prompt message
   */
  async startRegistration(phone: string): Promise<string> {
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
}
