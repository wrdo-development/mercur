/**
 * Unit tests for WrdoUserService — channel identity resolution + idempotency.
 *
 * The UNIQUE (channel, channel_user_id) index is what makes
 * getOrCreateByChannelIdentity idempotent in production; here we model that with
 * a fake directory and assert a second call returns the same user without a
 * second create.
 */

import {
  type Channel,
  type UserChannelIdentityRecord,
  WrdoUserService,
  type WrdoUserDirectory,
  type WrdoUserRecord,
} from '../wrdo-user.service';

/** In-memory fake directory honouring the UNIQUE (channel, channel_user_id) rule. */
function fakeDirectory() {
  const users = new Map<string, WrdoUserRecord>();
  const identities: UserChannelIdentityRecord[] = [];
  let seq = 0;
  const dir: WrdoUserDirectory & {
    _userCount: () => number;
    _identityCount: () => number;
  } = {
    async createWrdoUsers(data) {
      seq += 1;
      const user: WrdoUserRecord = {
        id: `wuser_${seq}`,
        display_name: (data.display_name as string | null) ?? null,
        marketing_consent: (data.marketing_consent as boolean) ?? false,
        service_consent: (data.service_consent as boolean) ?? true,
        is_active: true,
        registration_state: (data.registration_state as string) ?? 'pending',
        metadata: (data.metadata as Record<string, unknown> | null) ?? null,
      };
      users.set(user.id, user);
      return user;
    },
    async createUserChannelIdentities(data) {
      const id: UserChannelIdentityRecord = {
        id: `identity_${identities.length + 1}`,
        user_id: data.user_id as string,
        channel: data.channel as Channel,
        channel_user_id: data.channel_user_id as string,
      };
      identities.push(id);
      return id;
    },
    async listUserChannelIdentities(filters) {
      return identities.filter(
        (i) =>
          i.channel === filters.channel && i.channel_user_id === filters.channel_user_id,
      );
    },
    async retrieveWrdoUser(id) {
      const u = users.get(id);
      if (u === undefined) {
        throw new Error(`wrdo_user ${id} not found`);
      }
      return u;
    },
    async updateWrdoUsers(data) {
      const id = data.id as string;
      const existing = users.get(id);
      if (existing === undefined) {
        throw new Error(`wrdo_user ${id} not found`);
      }
      const updated: WrdoUserRecord = {
        ...existing,
        display_name:
          'display_name' in data ? (data.display_name as string | null) : existing.display_name,
        marketing_consent:
          'marketing_consent' in data
            ? (data.marketing_consent as boolean)
            : existing.marketing_consent,
        service_consent:
          'service_consent' in data
            ? (data.service_consent as boolean)
            : existing.service_consent,
        registration_state:
          'registration_state' in data
            ? (data.registration_state as string)
            : existing.registration_state,
        metadata:
          'metadata' in data
            ? (data.metadata as Record<string, unknown> | null)
            : existing.metadata,
      };
      users.set(id, updated);
      return updated;
    },
    _userCount: () => users.size,
    _identityCount: () => identities.length,
  };
  return dir;
}

describe('WrdoUserService.getOrCreateByChannelIdentity', () => {
  it('creates a user + identity on first contact', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);

    const user = await svc.getOrCreateByChannelIdentity('whatsapp', '27820000001', {
      displayName: 'Thabo',
      registrationState: 'complete',
    });

    expect(user.display_name).toBe('Thabo');
    expect(user.registration_state).toBe('complete');
    expect(dir._userCount()).toBe(1);
    expect(dir._identityCount()).toBe(1);
  });

  it('is idempotent — a second call with the same pair returns the same user, no dupes', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);

    const first = await svc.getOrCreateByChannelIdentity('whatsapp', '27820000001', {
      displayName: 'Thabo',
    });
    const second = await svc.getOrCreateByChannelIdentity('whatsapp', '27820000001', {
      displayName: 'Different Name',
    });

    expect(second.id).toBe(first.id);
    expect(dir._userCount()).toBe(1);
    expect(dir._identityCount()).toBe(1);
  });

  it('stores consent + metadata as passed', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);

    const user = await svc.getOrCreateByChannelIdentity('whatsapp', '27820000002', {
      marketingConsent: false,
      serviceConsent: true,
      metadata: { role: 'resident', interests: ['pets'] },
    });

    expect(user.service_consent).toBe(true);
    expect(user.marketing_consent).toBe(false);
    expect(user.metadata).toEqual({ role: 'resident', interests: ['pets'] });
  });
});

describe('WrdoUserService.getByChannelIdentity', () => {
  it('returns null when no identity exists', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);
    expect(await svc.getByChannelIdentity('whatsapp', 'nope')).toBeNull();
  });
});

describe('WrdoUserService.ensureGuest (guest-first, WRDO-180)', () => {
  it('creates a guest row on first contact', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);

    const user = await svc.ensureGuest('whatsapp', '27820000010');

    expect(user.registration_state).toBe('guest');
    expect(dir._userCount()).toBe(1);
    expect(dir._identityCount()).toBe(1);
  });

  it('is a no-op on a second call for the same phone — no duplicate, state unchanged', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);

    const first = await svc.ensureGuest('whatsapp', '27820000011');
    const second = await svc.ensureGuest('whatsapp', '27820000011');

    expect(second.id).toBe(first.id);
    expect(second.registration_state).toBe('guest');
    expect(dir._userCount()).toBe(1);
    expect(dir._identityCount()).toBe(1);
  });

  it('NEVER downgrades a complete user back to guest', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);

    // Existing complete user (e.g. registered earlier).
    const complete = await svc.getOrCreateByChannelIdentity('whatsapp', '27820000012', {
      displayName: 'Thabo',
      registrationState: 'complete',
    });
    expect(complete.registration_state).toBe('complete');

    // A later inbound message fires ensureGuest — must leave them complete.
    const after = await svc.ensureGuest('whatsapp', '27820000012');

    expect(after.id).toBe(complete.id);
    expect(after.registration_state).toBe('complete');
    expect(dir._userCount()).toBe(1);
  });
});

describe('WrdoUserService.promoteToComplete (WRDO-180)', () => {
  it('lifts an existing guest row to complete with name/consents/metadata — no second create', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);

    const guest = await svc.ensureGuest('whatsapp', '27820000013');
    expect(guest.registration_state).toBe('guest');
    expect(dir._userCount()).toBe(1);

    const promoted = await svc.promoteToComplete('whatsapp', '27820000013', {
      displayName: 'Lerato',
      serviceConsent: true,
      marketingConsent: false,
      metadata: { role: 'resident', interests: ['pets'] },
    });

    expect(promoted.id).toBe(guest.id);
    expect(promoted.registration_state).toBe('complete');
    expect(promoted.display_name).toBe('Lerato');
    expect(promoted.service_consent).toBe(true);
    expect(promoted.marketing_consent).toBe(false);
    expect(promoted.metadata).toEqual({ role: 'resident', interests: ['pets'] });
    // Still exactly ONE user — promoted in place, not duplicated.
    expect(dir._userCount()).toBe(1);
  });

  it('creates-then-completes if no guest exists yet (ensureGuest was skipped)', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);

    const promoted = await svc.promoteToComplete('whatsapp', '27820000014', {
      displayName: 'Naledi',
    });

    expect(promoted.registration_state).toBe('complete');
    expect(promoted.display_name).toBe('Naledi');
    expect(dir._userCount()).toBe(1);
  });
});

describe('WrdoUserService.updateProfile (WRDO-180)', () => {
  it('writes only the provided fields, leaving others untouched', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);

    const user = await svc.getOrCreateByChannelIdentity('whatsapp', '27820000015', {
      displayName: 'Original',
      marketingConsent: true,
      metadata: { keep: 'me' },
    });

    const updated = await svc.updateProfile(user.id, { registrationState: 'complete' });

    expect(updated.registration_state).toBe('complete');
    // Untouched fields survive.
    expect(updated.display_name).toBe('Original');
    expect(updated.marketing_consent).toBe(true);
    expect(updated.metadata).toEqual({ keep: 'me' });
  });
});
