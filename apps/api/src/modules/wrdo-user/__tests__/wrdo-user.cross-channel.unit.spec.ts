/**
 * Cross-channel identity tests for WrdoUserService.
 *
 * THE INVARIANT: phone is the universal anchor. A person who arrives on WhatsApp
 * and later on web (or vice-versa) with the SAME phone number must resolve to the
 * SAME wrdo_users row — never a duplicate, no merge engine. The phone IS the merge.
 *
 * The fakeDirectory here mirrors the one in wrdo-user.service.unit.spec.ts but its
 * listUserChannelIdentities honours BOTH filter shapes:
 *  - { channel, channel_user_id }  -> exact-match idempotency lookup
 *  - { channel_user_id }           -> cross-channel "find by phone" lookup
 * (The real MedusaService-generated listUserChannelIdentities accepts a filter
 * object, so passing only channel_user_id works against the live module too.)
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
      return identities.filter((i) => {
        if (
          filters.channel !== undefined &&
          i.channel !== (filters.channel as Channel)
        ) {
          return false;
        }
        if (
          filters.channel_user_id !== undefined &&
          i.channel_user_id !== (filters.channel_user_id as string)
        ) {
          return false;
        }
        return true;
      });
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

describe('phone is the universal identity anchor (no merge engine)', () => {
  it('whatsapp-first then web with the same phone resolves to the SAME user', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);
    const viaWa = await svc.getOrCreateByChannelIdentity('whatsapp', '27820000001', {
      displayName: 'Thabo',
    });
    const viaWeb = await svc.getOrCreateByChannelIdentity('web', '27820000001');
    expect(viaWeb.id).toBe(viaWa.id);
  });

  it('web-first then whatsapp with the same phone resolves to the SAME user', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);
    const viaWeb = await svc.getOrCreateByChannelIdentity('web', '27820000002');
    const viaWa = await svc.getOrCreateByChannelIdentity('whatsapp', '27820000002', {
      displayName: 'Lerato',
    });
    expect(viaWa.id).toBe(viaWeb.id);
  });

  it('adds the new channel as an identity row (links, not duplicates)', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);
    await svc.getOrCreateByChannelIdentity('whatsapp', '27820000003');
    await svc.getOrCreateByChannelIdentity('web', '27820000003');
    // same phone, two channels -> ONE user, TWO identity rows
    expect(dir._userCount()).toBe(1);
    expect(dir._identityCount()).toBe(2);
  });

  it('different phones create different users', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);
    const a = await svc.getOrCreateByChannelIdentity('whatsapp', '27820000004');
    const b = await svc.getOrCreateByChannelIdentity('whatsapp', '27820000005');
    expect(a.id).not.toBe(b.id);
  });

  it('repeated same (channel, phone) stays idempotent — one user, one identity', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);
    await svc.getOrCreateByChannelIdentity('whatsapp', '27820000006');
    await svc.getOrCreateByChannelIdentity('whatsapp', '27820000006');
    expect(dir._userCount()).toBe(1);
    expect(dir._identityCount()).toBe(1);
  });
});
