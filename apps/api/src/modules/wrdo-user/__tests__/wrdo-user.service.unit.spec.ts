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
