/**
 * Unit tests for RegistrationFlowHandler.startRegistration — restart safety.
 *
 * Bug (WRDO-169 follow-up): a re-greeting ("hi"/"hey") while a user was already
 * mid-registration re-ran startRegistration, which overwrote their state back to
 * collect_name — silently resetting their progress and desyncing the screen from
 * the state machine. startRegistration must NOT clobber an in-progress flow.
 */

import { RegistrationFlowHandler } from '../registration.flow-handler';
import type { ConversationState } from '../../../tribe-sessions/types';

function fakeStateService(initial: ConversationState | null) {
  let state: ConversationState | null = initial;
  return {
    getState: jest.fn(async () => state),
    setState: jest.fn(async (_phone: string, s: ConversationState) => {
      state = s;
    }),
    clearState: jest.fn(async () => {
      state = null;
    }),
    _current: () => state,
  };
}

const PHONE = '27820000001';

describe('startRegistration — does not clobber an in-progress flow', () => {
  it('resumes (re-prompts current step) when a registration is already in progress', async () => {
    const inProgress: ConversationState = {
      flow: 'registration',
      step: 'collect_interests',
      data: { name: 'Alwyn', role: 'resident' },
      retriesLeft: 3,
      lastUpdatedAt: new Date().toISOString(),
    };
    const svc = fakeStateService(inProgress);
    const handler = new RegistrationFlowHandler({
      conversationStateService: svc as never,
    });

    await handler.startRegistration(PHONE);

    // State must NOT be reset to collect_name.
    expect(svc._current()?.step).toBe('collect_interests');
    expect(svc._current()?.data.role).toBe('resident');
  });

  it('starts fresh when there is no existing state', async () => {
    const svc = fakeStateService(null);
    const handler = new RegistrationFlowHandler({
      conversationStateService: svc as never,
    });

    await handler.startRegistration(PHONE);

    expect(svc._current()?.step).toBe('collect_name');
    expect(svc.setState).toHaveBeenCalled();
  });
});

describe('startRegistration — confirm-not-collect (WRDO-169)', () => {
  it('confirms a known profile name instead of asking cold', async () => {
    const svc = fakeStateService(null);
    const handler = new RegistrationFlowHandler({
      conversationStateService: svc as never,
    });

    const reply = await handler.startRegistration(PHONE, 'Thabo');

    expect(svc._current()?.step).toBe('confirm_name');
    expect(svc._current()?.data.name).toBe('Thabo');
    expect(reply).toContain('Thabo');
    expect(reply.toLowerCase()).toContain('confirm');
  });

  it('falls back to the cold collect_name path when no name is available', async () => {
    const svc = fakeStateService(null);
    const handler = new RegistrationFlowHandler({
      conversationStateService: svc as never,
    });

    await handler.startRegistration(PHONE, null);

    expect(svc._current()?.step).toBe('collect_name');
  });

  it('treats a one-character profile name as no-name (cold path)', async () => {
    const svc = fakeStateService(null);
    const handler = new RegistrationFlowHandler({
      conversationStateService: svc as never,
    });

    await handler.startRegistration(PHONE, 'X');

    expect(svc._current()?.step).toBe('collect_name');
  });

  it('re-prompts the confirm question when resuming a confirm_name flow', async () => {
    const inProgress: ConversationState = {
      flow: 'registration',
      step: 'confirm_name',
      data: { name: 'Lerato' },
      retriesLeft: 3,
      lastUpdatedAt: new Date().toISOString(),
    };
    const svc = fakeStateService(inProgress);
    const handler = new RegistrationFlowHandler({
      conversationStateService: svc as never,
    });

    const reply = await handler.startRegistration(PHONE);

    expect(svc._current()?.step).toBe('confirm_name');
    expect(reply).toContain('Lerato');
  });
});
