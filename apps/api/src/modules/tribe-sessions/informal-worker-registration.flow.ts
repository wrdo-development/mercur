/**
 * Informal worker registration flow.
 * Triggered when user selects 'informal_worker' in registration role step.
 * Steps: your_name → what_you_do → your_areas → selfie → availability → create_provider.
 */

import type { ConversationState } from './conversation-state.service';
import { FAILURE_MESSAGES } from './failure-messages.constants';

export const INFORMAL_WORKER_STEPS = [
  'your_name',
  'what_you_do',
  'your_areas',
  'selfie',
  'availability',
  'create_provider',
] as const;

export type InformalWorkerStep = (typeof INFORMAL_WORKER_STEPS)[number];

export interface InformalWorkerFlowResult {
  cleared?: boolean;
  completed?: boolean;
  errorCode?: string;
  message: string;
  nextState?: ConversationState;
  ok: boolean;
}

const CANCEL_TRIGGERS = ['stop', 'cancel'];

/**
 * Get prompt for informal worker step.
 */
export function getInformalWorkerPromptForStep(step: string): string {
  switch (step) {
    case 'your_name':
      return 'What name should residents see when they find you? (Your display name)';
    case 'what_you_do':
      return 'What do you do? Pick your main service: gardener, domestic worker, handyman, driver, other';
    case 'your_areas':
      return 'Which areas do you work in? (e.g. Sandton, Rosebank, Midrand)';
    case 'selfie':
      return "Send a quick selfie so we can verify it's you. 📸";
    case 'availability':
      return 'When are you typically available? (e.g. Mon-Fri 7am-5pm)';
    case 'create_provider':
      return '';
    default:
      return '';
  }
}

function buildUnrecognised(step: string): string {
  const prompt = getInformalWorkerPromptForStep(step);
  const base = FAILURE_MESSAGES.unrecognised_input;
  if (prompt) {
    return base.replace('[re-prompt current step question]', prompt);
  }
  return base;
}

/**
 * Process one informal worker registration step.
 */
export function processInformalWorkerStep(
  state: ConversationState,
  text: string,
  messageType: string,
): InformalWorkerFlowResult {
  const trimmed = text.trim().toLowerCase();
  if (CANCEL_TRIGGERS.includes(trimmed)) {
    return {
      cleared: true,
      message: FAILURE_MESSAGES.cancel_mid_flow,
      ok: false,
    };
  }

  switch (state.step) {
    case 'your_name': {
      if (text.trim().length < 2) {
        return {
          errorCode: 'name_too_short',
          message: FAILURE_MESSAGES.name_too_short,
          ok: false,
        };
      }
      return {
        message: getInformalWorkerPromptForStep('what_you_do'),
        nextState: {
          ...state,
          data: { ...state.data, displayName: text.trim() },
          lastUpdatedAt: new Date().toISOString(),
          retriesLeft: 3,
          step: 'what_you_do',
        },
        ok: true,
      };
    }
    case 'what_you_do': {
      const normalized = trimmed === 'domestic_worker' ? 'domestic worker' : trimmed;
      const valid = ['gardener', 'domestic worker', 'handyman', 'driver', 'other'];
      if (!valid.includes(normalized)) {
        return {
          errorCode: 'unrecognised_input',
          message: buildUnrecognised('what_you_do'),
          ok: false,
        };
      }
      return {
        message: getInformalWorkerPromptForStep('your_areas'),
        nextState: {
          ...state,
          data: { ...state.data, serviceType: trimmed },
          lastUpdatedAt: new Date().toISOString(),
          retriesLeft: 3,
          step: 'your_areas',
        },
        ok: true,
      };
    }
    case 'your_areas': {
      if (text.trim().length < 2) {
        return {
          errorCode: 'unrecognised_input',
          message: buildUnrecognised('your_areas'),
          ok: false,
        };
      }
      return {
        message: getInformalWorkerPromptForStep('selfie'),
        nextState: {
          ...state,
          data: { ...state.data, areas: text.trim() },
          lastUpdatedAt: new Date().toISOString(),
          retriesLeft: 3,
          step: 'selfie',
        },
        ok: true,
      };
    }
    case 'selfie': {
      if (messageType !== 'image') {
        return {
          errorCode: 'unrecognised_input',
          message: buildUnrecognised('selfie'),
          ok: false,
        };
      }
      return {
        message: getInformalWorkerPromptForStep('availability'),
        nextState: {
          ...state,
          data: { ...state.data, selfieReceived: true },
          lastUpdatedAt: new Date().toISOString(),
          retriesLeft: 3,
          step: 'availability',
        },
        ok: true,
      };
    }
    case 'availability': {
      if (text.trim().length < 3) {
        return {
          errorCode: 'availability_unclear',
          message: FAILURE_MESSAGES.availability_unclear,
          ok: false,
        };
      }
      return {
        completed: true,
        message: "You're registered! 🎉 Residents can now find you. Welcome to WRDO! 💚",
        nextState: {
          ...state,
          data: { ...state.data, availability: text.trim() },
          lastUpdatedAt: new Date().toISOString(),
          retriesLeft: 3,
          step: 'create_provider',
        },
        ok: true,
      };
    }
    default:
      return {
        errorCode: 'unrecognised_input',
        message: buildUnrecognised(state.step),
        ok: false,
      };
  }
}
