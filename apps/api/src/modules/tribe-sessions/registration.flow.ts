/**
 * Resident registration flow orchestrator.
 * Multi-step: collect_name → collect_role → collect_interests → request_selfie → request_gps → request_consent → create_user.
 */

import type { ConversationState } from './conversation-state.service';
import { FAILURE_MESSAGES } from './failure-messages.constants';

export const RESIDENT_STEPS = [
  'collect_name',
  'collect_role',
  'collect_interests',
  'request_selfie',
  'request_gps',
  'request_consent',
  'create_user',
] as const;

export type ResidentStep = (typeof RESIDENT_STEPS)[number];

export interface RegistrationFlowResult {
  cleared?: boolean;
  completed?: boolean;
  errorCode?: string;
  message: string;
  nextState?: ConversationState;
  ok: boolean;
}

const CANCEL_TRIGGERS = ['stop', 'cancel'];

const VALID_ROLES = ['resident', 'provider', 'informal_worker'];

const STEP_PROMPTS: Record<string, string> = {
  collect_name: "Hey! 👋 What's your name?",
  collect_role:
    'Nice to meet you! Are you here as a resident, service provider, or informal worker? (Reply: resident / provider / informal worker)',
  collect_interests:
    'Quick one before we continue — what kinds of things interest you most?\nPick as many as you like! (Reply with numbers, e.g. 1 3 5)\n\n1. 🌿 Garden & Outdoor\n2. 🍳 Food & Cooking\n3. 🍛 Restaurants & Eating Out\n4. 💪 Health & Fitness\n5. 🐶 Pets\n6. 🦰 Kids & Family\n7. 💻 Tech & Gadgets\n8. 🏫 Education & Tutoring\n9. 🔨 Home Improvement\n10. 💼 Local Business & Shopping\n11. 🎵 Entertainment & Events\n12. 🚗 Travel & Transport',
  request_selfie: "Almost there! Send me a quick selfie so I can verify it's you. 📸",
  request_gps: 'Share your location so we can find providers near you.',
  request_consent:
    'By continuing, you agree to our Terms of Service and Privacy Policy. Reply YES to confirm.',
  create_user: '',
};

/**
 * Get the prompt message for a given step.
 *
 * @param step - Current step id
 * @returns Prompt string or empty if no prompt
 */
export function getPromptForStep(step: string): string {
  switch (step) {
    case 'collect_name':
      return STEP_PROMPTS.collect_name;
    case 'collect_role':
      return STEP_PROMPTS.collect_role;
    case 'collect_interests':
      return STEP_PROMPTS.collect_interests;
    case 'request_selfie':
      return STEP_PROMPTS.request_selfie;
    case 'request_gps':
      return STEP_PROMPTS.request_gps;
    case 'request_consent':
      return STEP_PROMPTS.request_consent;
    case 'create_user':
      return STEP_PROMPTS.create_user;
    default:
      return '';
  }
}

function buildUnrecognisedMessage(step: string): string {
  const prompt = getPromptForStep(step);
  const base = FAILURE_MESSAGES.unrecognised_input;
  if (prompt) {
    return base.replace('[re-prompt current step question]', prompt);
  }
  return base;
}

/**
 * Process one registration step. Validates input, advances state, returns message to send.
 *
 * @param state - Current conversation state
 * @param text - User input text
 * @param messageType - Type of message (text, image, location, etc.)
 * @returns Result with message and optional next state
 */
export function processRegistrationStep(
  state: ConversationState,
  text: string,
  _messageType: string,
): RegistrationFlowResult {
  const trimmed = text.trim().toLowerCase();
  if (CANCEL_TRIGGERS.includes(trimmed)) {
    return {
      cleared: true,
      message: FAILURE_MESSAGES.cancel_mid_flow,
      ok: false,
    };
  }

  switch (state.step) {
    case 'collect_name': {
      if (text.trim().length < 2) {
        return {
          errorCode: 'name_too_short',
          message: FAILURE_MESSAGES.name_too_short,
          ok: false,
        };
      }
      const nextState: ConversationState = {
        ...state,
        data: { ...state.data, name: text.trim() },
        lastUpdatedAt: new Date().toISOString(),
        retriesLeft: 3,
        step: 'collect_role',
      };
      return {
        message: getPromptForStep('collect_role'),
        nextState,
        ok: true,
      };
    }
    case 'collect_role': {
      const role = trimmed;
      if (!VALID_ROLES.includes(role)) {
        return {
          errorCode: 'unrecognised_input',
          message: buildUnrecognisedMessage('collect_role'),
          ok: false,
        };
      }
      const nextState: ConversationState = {
        ...state,
        data: { ...state.data, role },
        lastUpdatedAt: new Date().toISOString(),
        retriesLeft: 3,
        step: 'collect_interests',
      };
      return {
        message: getPromptForStep('collect_interests'),
        nextState,
        ok: true,
      };
    }
    default:
      return {
        errorCode: 'unrecognised_input',
        message: buildUnrecognisedMessage(state.step),
        ok: false,
      };
  }
}
