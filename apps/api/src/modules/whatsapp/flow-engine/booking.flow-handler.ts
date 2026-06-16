/**
 * Booking flow handler.
 * Routes mid-flow messages to BookingFlow; manages ConversationStateService and pending_booking Redis.
 *
 * Provider response linkage (Redis key routing): When a provider replies to a pending booking,
 * GET pending_booking:provider:{phone} determines if we handle it. Tier 0: yes_confirm -> confirmed,
 * no_decline -> provider_declined, else re-prompt.
 *
 * Phase 1 limitation: Redis holds only the most recent pending booking per provider.
 * If a provider has two simultaneous pending bookings, only the latest is routable.
 */

import { getPromptForStep, processBookingStep } from '../../../modules/tribe-sessions/booking.flow';
import type { ConversationState } from '../../../modules/tribe-sessions/conversation-state.service';
import type {
  BookingFlowHandlerOptions,
  PendingBookingPayload,
  ProcessInputResult,
  ProviderResponseResult,
} from './booking.flow-handler.types';
import {
  clearPendingBooking,
  formatProviderOptions,
  getPendingBooking,
  handleProviderResponseLogic,
  setPendingBooking,
} from './booking.flow-handler.utils';

export type {
  BookingFlowHandlerOptions,
  FindTopProvidersOptions,
  IBookingProviderFinder,
  PendingBookingPayload,
  PendingBookingRedisAdapter,
  ProcessInputResult,
  ProviderResponseAction,
  ProviderResponseResult,
} from './booking.flow-handler.types';

/**
 * Handler for booking flow. Manages resident flow and provider response routing.
 */
export class BookingFlowHandler {
  private readonly conversationStateService: BookingFlowHandlerOptions['conversationStateService'];
  private readonly pendingBookingRedis: BookingFlowHandlerOptions['pendingBookingRedis'];
  private readonly providerFinder: BookingFlowHandlerOptions['providerFinder'];
  private readonly getAreaForResident: BookingFlowHandlerOptions['getAreaForResident'];

  constructor(options: BookingFlowHandlerOptions) {
    this.conversationStateService = options.conversationStateService;
    this.pendingBookingRedis = options.pendingBookingRedis;
    this.providerFinder = options.providerFinder;
    this.getAreaForResident = options.getAreaForResident;
  }

  static isBookingTrigger(text: string): boolean {
    const t = text.trim().toLowerCase();
    const triggers = ['book', 'booking', 'need a', 'i need a', 'want a', 'find me'];
    return triggers.some((trigger) => t.startsWith(trigger) || t.includes(`${trigger} `));
  }

  /**
   * Create initial booking state and return first prompt.
   */
  async startBooking(phone: string): Promise<string> {
    const initialState: ConversationState = {
      flow: 'booking',
      step: 'collect_service_type',
      data: {},
      retriesLeft: 3,
      lastUpdatedAt: new Date().toISOString(),
    };
    await this.conversationStateService.setState(phone, initialState);
    return getPromptForStep('collect_service_type');
  }

  /**
   * Process resident input in booking flow.
   */
  async processInput(
    phone: string,
    state: ConversationState,
    text: string,
    messageType: string,
  ): Promise<ProcessInputResult> {
    const result = processBookingStep(state, text, messageType);

    if (result.cleared === true) {
      await this.conversationStateService.clearState(phone);
      return { clearState: true, message: result.message };
    }

    if (!result.ok || !result.nextState) {
      return { message: result.message };
    }

    if (result.nextState.step === 'find_providers') {
      return this.handleFindProviders(phone, result.nextState);
    }

    await this.conversationStateService.setState(phone, result.nextState);
    return {
      message: result.message,
      nextState: result.nextState,
    };
  }

  async getPendingBooking(providerPhone: string): Promise<PendingBookingPayload | null> {
    return getPendingBooking(this.pendingBookingRedis, providerPhone);
  }

  async setPendingBooking(providerPhone: string, payload: PendingBookingPayload): Promise<void> {
    return setPendingBooking(this.pendingBookingRedis, providerPhone, payload);
  }

  async clearPendingBooking(providerPhone: string): Promise<void> {
    return clearPendingBooking(this.pendingBookingRedis, providerPhone);
  }

  async handleProviderResponse(
    providerPhone: string,
    text: string,
  ): Promise<ProviderResponseResult> {
    return handleProviderResponseLogic(this.pendingBookingRedis, providerPhone, text);
  }

  private async handleFindProviders(
    phone: string,
    nextState: ConversationState,
  ): Promise<ProcessInputResult> {
    const areaId = await this.getAreaForResident(phone);
    if (areaId === null || areaId === '') {
      const noAreaState: ConversationState = {
        ...nextState,
        step: 'collect_preferred_time',
      };
      await this.conversationStateService.setState(phone, noAreaState);
      return {
        message:
          "I don't have your area yet. Share your location or tell me your suburb to find providers nearby.",
        nextState: noAreaState,
      };
    }

    const rawInput = nextState.data.serviceTypeInput;
    const serviceTypeInput = typeof rawInput === 'string' ? rawInput : '';
    const providers = await this.providerFinder.findTopProviders({
      areaId,
      excludeProviderIds: [],
      limit: 3,
      serviceTypeInput,
    });

    if (providers.length === 0) {
      await this.conversationStateService.clearState(phone);
      return {
        clearState: true,
        message:
          'Sorry, no providers available for that service in your area right now. Try another time or service!',
      };
    }

    const presentState: ConversationState = {
      ...nextState,
      data: { ...nextState.data, providers },
      step: 'present_options',
    };
    await this.conversationStateService.setState(phone, presentState);
    const optionsMessage = formatProviderOptions(providers);
    return {
      message: optionsMessage,
      nextState: presentState,
    };
  }
}
