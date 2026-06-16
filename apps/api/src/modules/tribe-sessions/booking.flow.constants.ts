/**
 * Booking flow constants, types, and prompt helpers.
 */

import type { ConversationState } from './conversation-state.service';
import { FAILURE_MESSAGES } from './failure-messages.constants';

export const BOOKING_STEPS = [
  'collect_service_type',
  'collect_preferred_time',
  'find_providers',
  'present_options',
  'confirm_choice',
  'send_to_provider',
  'await_provider_response',
  'confirm_both_parties',
] as const;

export type BookingStep = (typeof BOOKING_STEPS)[number];

export interface BookingFlowResult {
  cleared?: boolean;
  errorCode?: string;
  message: string;
  nextState?: ConversationState;
  ok: boolean;
}

export const CANCEL_TRIGGERS = ['stop', 'cancel'];

export const YES_CONFIRM_PATTERN =
  /^(yes|yeah|yep|ja|sure|ok|okay|10-4|sharp|lekker|deal|confirmed)\b/i;

export const STEP_PROMPTS: Record<string, string> = {
  collect_service_type: 'What service do you need? (e.g. plumber, electrician, maid, gardener)',
  collect_preferred_time:
    'When would you like it? Tell me your preferred time (e.g. tomorrow 2pm, next Monday morning)',
  present_options: 'Reply 1, 2 or 3 to choose your provider:',
  confirm_choice: 'Reply YES to confirm your booking with this provider.',
};

/**
 * Get the prompt message for a given step.
 *
 * @param step - Current step id
 * @returns Prompt string or empty for system-only steps
 */
export function getPromptForStep(step: string): string {
  switch (step) {
    case 'collect_service_type':
      return STEP_PROMPTS.collect_service_type;
    case 'collect_preferred_time':
      return STEP_PROMPTS.collect_preferred_time;
    case 'present_options':
      return STEP_PROMPTS.present_options;
    case 'confirm_choice':
      return STEP_PROMPTS.confirm_choice;
    default:
      return '';
  }
}

export function buildUnrecognisedMessage(step: string): string {
  const prompt = getPromptForStep(step);
  const base = FAILURE_MESSAGES.unrecognised_input;
  if (prompt) {
    return base.replace('[re-prompt current step question]', prompt);
  }
  return base;
}
