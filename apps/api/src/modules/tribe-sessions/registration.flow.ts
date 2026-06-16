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
const SKIP_TRIGGERS = ['skip', 'none', 'done'];
const CONSENT_YES = ['yes', 'y', 'agree', 'i agree', 'ok', 'okay'];

const VALID_ROLES = ['resident', 'provider', 'informal_worker'];

/** Interest options, indexed 1..12 to match the collect_interests prompt list. */
const INTEREST_OPTIONS = [
  'garden_outdoor',
  'food_cooking',
  'restaurants',
  'health_fitness',
  'pets',
  'kids_family',
  'tech_gadgets',
  'education_tutoring',
  'home_improvement',
  'local_business',
  'entertainment_events',
  'travel_transport',
] as const;

/**
 * Parse an interests reply into interest tags.
 * Accepts space-, comma-, or run-together digits (e.g. "1 3 5", "1,3,5", "135"),
 * keeps only valid 1..12 selections, de-duplicates, preserves order.
 *
 * @param text - Raw user reply
 * @returns Array of interest tags (may be empty if nothing valid parsed)
 */
export function parseInterests(text: string): string[] {
  const matches = text.match(/\d{1,2}/g) ?? [];
  const seen = new Set<number>();
  const tags: string[] = [];
  for (const m of matches) {
    const n = Number.parseInt(m, 10);
    if (n >= 1 && n <= INTEREST_OPTIONS.length && !seen.has(n)) {
      seen.add(n);
      tags.push(INTEREST_OPTIONS[n - 1]);
    }
  }
  return tags;
}

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
    case 'collect_interests': {
      // Interests are optional — "skip"/"done"/"none" moves on with none selected.
      const skipped = SKIP_TRIGGERS.includes(trimmed);
      const interests = skipped ? [] : parseInterests(text);
      if (!skipped && interests.length === 0) {
        // Couldn't parse any valid 1..12 selection — re-prompt rather than dead-end.
        return {
          errorCode: 'unrecognised_input',
          message: buildUnrecognisedMessage('collect_interests'),
          ok: false,
        };
      }
      const nextState: ConversationState = {
        ...state,
        data: { ...state.data, interests },
        lastUpdatedAt: new Date().toISOString(),
        retriesLeft: 3,
        step: 'request_selfie',
      };
      return {
        message: getPromptForStep('request_selfie'),
        nextState,
        ok: true,
      };
    }
    case 'request_selfie': {
      // Expect an image. "skip" advances (soft-trust: selfie can come later).
      const skipped = SKIP_TRIGGERS.includes(trimmed);
      if (!skipped && _messageType !== 'image') {
        return {
          errorCode: 'expecting_image',
          message: buildUnrecognisedMessage('request_selfie'),
          ok: false,
        };
      }
      const nextState: ConversationState = {
        ...state,
        data: { ...state.data, selfieProvided: !skipped },
        lastUpdatedAt: new Date().toISOString(),
        retriesLeft: 3,
        step: 'request_gps',
      };
      return {
        message: getPromptForStep('request_gps'),
        nextState,
        ok: true,
      };
    }
    case 'request_gps': {
      // Expect a location share. "skip" advances (location is optional).
      const skipped = SKIP_TRIGGERS.includes(trimmed);
      if (!skipped && _messageType !== 'location') {
        return {
          errorCode: 'expecting_location',
          message: buildUnrecognisedMessage('request_gps'),
          ok: false,
        };
      }
      const nextState: ConversationState = {
        ...state,
        data: { ...state.data, locationProvided: !skipped },
        lastUpdatedAt: new Date().toISOString(),
        retriesLeft: 3,
        step: 'request_consent',
      };
      return {
        message: getPromptForStep('request_consent'),
        nextState,
        ok: true,
      };
    }
    case 'request_consent': {
      if (!CONSENT_YES.includes(trimmed)) {
        return {
          errorCode: 'consent_not_given',
          message: buildUnrecognisedMessage('request_consent'),
          ok: false,
        };
      }
      // Consent given → registration complete. User persistence (create_user via
      // Supabase) is a later phase; for now we finish the conversation cleanly and
      // clear state so the next message starts fresh. The collected data lives in
      // the (cleared) state's data bag; wiring it to Supabase is the next step.
      return {
        completed: true,
        cleared: true,
        message:
          "You're all set! 🎉 Welcome to WRDO. I'll remember what you're into and help you find what you need around the estate.",
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
