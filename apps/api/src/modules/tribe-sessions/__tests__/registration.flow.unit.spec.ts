/**
 * Unit tests for the registration flow's role step + restart safety.
 *
 * Born from a live bug (WRDO-169 follow-up): the role step rejected "residents"
 * (plural) with "Hmm, I didn't quite get that", and re-greetings restarted a
 * mid-flow user. State persistence was never the problem — the parsing and the
 * restart guard were.
 */

import { processRegistrationStep } from '../registration.flow';
import type { ConversationState } from '../types';

function roleState(): ConversationState {
  return {
    flow: 'registration',
    step: 'collect_role',
    data: { name: 'Alwyn' },
    retriesLeft: 3,
    lastUpdatedAt: new Date().toISOString(),
  };
}

describe('registration collect_role — forgiving input', () => {
  // The exact failure from the transcript: user typed "residents".
  it.each([
    ['resident', 'resident'],
    ['residents', 'resident'],
    ['Resident', 'resident'],
    ['  RESIDENT ', 'resident'],
    ['provider', 'provider'],
    ['providers', 'provider'],
    ['service provider', 'provider'],
    ['informal worker', 'informal_worker'],
    ['informal', 'informal_worker'],
    ['worker', 'informal_worker'],
  ])('accepts %p and stores role %p', (input, expectedRole) => {
    const result = processRegistrationStep(roleState(), input, 'text');
    expect(result.ok).toBe(true);
    expect(result.nextState?.data.role).toBe(expectedRole);
    expect(result.nextState?.step).toBe('collect_interests');
  });

  it('still rejects genuine nonsense at the role step', () => {
    const result = processRegistrationStep(roleState(), 'banana', 'text');
    expect(result.ok).toBe(false);
    expect(result.nextState).toBeUndefined();
  });
});
