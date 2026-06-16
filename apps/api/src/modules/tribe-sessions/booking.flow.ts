/**
 * Booking flow orchestrator.
 * Multi-step: collect_service_type -> collect_preferred_time -> find_providers ->
 * present_options -> confirm_choice -> send_to_provider -> await_provider_response -> confirm_both_parties.
 */

import {
  type BookingFlowResult,
  buildUnrecognisedMessage,
  CANCEL_TRIGGERS,
  getPromptForStep,
  YES_CONFIRM_PATTERN,
} from './booking.flow.constants';
import type { ConversationState } from './conversation-state.service';
import { FAILURE_MESSAGES } from './failure-messages.constants';

export type { BookingFlowResult, BookingStep } from './booking.flow.constants';
// Re-export public API from constants
export { BOOKING_STEPS, getPromptForStep } from './booking.flow.constants';

/**
 * Process one booking step. Validates input, advances state, returns message to send.
 * Steps find_providers, send_to_provider, await_provider_response are system-only;
 * processBookingStep handles resident input for collect_*, present_options, confirm_choice.
 *
 * @param state - Current conversation state
 * @param text - User input text
 * @param _messageType - Type of message (text, image, location, etc.)
 * @returns Result with message and optional next state
 */
export function processBookingStep(
  state: ConversationState,
  text: string,
  _messageType: string,
): BookingFlowResult {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (CANCEL_TRIGGERS.includes(lower)) {
    return {
      cleared: true,
      message: FAILURE_MESSAGES.cancel_mid_flow,
      ok: false,
    };
  }

  switch (state.step) {
    case 'collect_service_type': {
      if (trimmed.length < 2) {
        return {
          errorCode: 'unrecognised_input',
          message: buildUnrecognisedMessage('collect_service_type'),
          ok: false,
        };
      }
      const nextState: ConversationState = {
        ...state,
        data: { ...state.data, serviceTypeInput: trimmed },
        lastUpdatedAt: new Date().toISOString(),
        retriesLeft: 3,
        step: 'collect_preferred_time',
      };
      return {
        message: getPromptForStep('collect_preferred_time'),
        nextState,
        ok: true,
      };
    }
    case 'collect_preferred_time': {
      if (trimmed.length < 2) {
        return {
          errorCode: 'unrecognised_input',
          message: buildUnrecognisedMessage('collect_preferred_time'),
          ok: false,
        };
      }
      const nextState: ConversationState = {
        ...state,
        data: { ...state.data, preferredTimeInput: trimmed },
        lastUpdatedAt: new Date().toISOString(),
        retriesLeft: 3,
        step: 'find_providers',
      };
      return {
        message: getPromptForStep('find_providers') || 'Finding providers near you...',
        nextState,
        ok: true,
      };
    }
    case 'present_options': {
      return handlePresentOptions(state, lower, trimmed);
    }
    case 'confirm_choice': {
      if (!YES_CONFIRM_PATTERN.test(lower)) {
        return {
          errorCode: 'unrecognised_input',
          message: buildUnrecognisedMessage('confirm_choice'),
          ok: false,
        };
      }
      const nextState: ConversationState = {
        ...state,
        lastUpdatedAt: new Date().toISOString(),
        retriesLeft: 3,
        step: 'send_to_provider',
      };
      return {
        message: 'Sending your booking request to the provider...',
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

function handlePresentOptions(
  state: ConversationState,
  lower: string,
  _trimmed: string,
): BookingFlowResult {
  const providersRaw = state.data.providers;
  const providers = Array.isArray(providersRaw) ? providersRaw : [];
  const maxChoice = Math.min(3, providers.length);
  const choice = Number(lower);
  if (!Number.isInteger(choice) || choice < 1 || choice > maxChoice) {
    return {
      errorCode: 'unrecognised_input',
      message:
        maxChoice === 3
          ? 'Please reply 1, 2 or 3 to choose your provider.'
          : `Please reply 1 or ${String(maxChoice)} to choose your provider.`,
      ok: false,
    };
  }
  const nextState: ConversationState = {
    ...state,
    data: {
      ...state.data,
      selectedProviderIndex: choice - 1,
    },
    lastUpdatedAt: new Date().toISOString(),
    retriesLeft: 3,
    step: 'confirm_choice',
  };
  return {
    message: getPromptForStep('confirm_choice'),
    nextState,
    ok: true,
  };
}
