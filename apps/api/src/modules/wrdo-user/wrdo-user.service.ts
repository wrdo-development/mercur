/**
 * WrdoUserService — channel-agnostic user resolution over the wrdo-user module.
 *
 * Ported (leaner) from product-tribe: the clean-install mercur version drops the
 * repository + IWrdoUserDirectory + dual-write indirection and depends directly
 * on the MedusaService-generated CRUD methods via a minimal directory interface
 * (kept as an interface purely so unit tests can inject a fake).
 *
 * The only methods the registration flow needs today are getOrCreate / get; the
 * link/unlink/erase surface from product-tribe lands when the front-desk `you`
 * flows wire up (plan step "Wiring the heart.* handlers").
 */

export type Channel = 'whatsapp' | 'telegram' | 'messenger' | 'web';

export interface WrdoUserRecord {
  id: string;
  display_name: string | null;
  marketing_consent: boolean;
  service_consent: boolean;
  is_active: boolean;
  registration_state: string;
  metadata: Record<string, unknown> | null;
}

export interface UserChannelIdentityRecord {
  id: string;
  user_id: string;
  channel: Channel;
  channel_user_id: string;
}

/**
 * Minimal slice of WrdoUserModuleService that WrdoUserService consumes. Lets the
 * service be unit-tested with a fake and constructed from the resolved Medusa
 * module in production (the generated method names match exactly).
 */
export interface WrdoUserDirectory {
  createWrdoUsers(data: Record<string, unknown>): Promise<WrdoUserRecord | WrdoUserRecord[]>;
  createUserChannelIdentities(
    data: Record<string, unknown>,
  ): Promise<UserChannelIdentityRecord | UserChannelIdentityRecord[]>;
  listUserChannelIdentities(
    filters: Record<string, unknown>,
  ): Promise<UserChannelIdentityRecord[]>;
  retrieveWrdoUser(id: string): Promise<WrdoUserRecord>;
  /**
   * MedusaService-generated update. Accepts `{ id, ...fields }` (single) and
   * returns the updated record. Used by promoteToComplete / updateProfile to
   * lift a guest row to 'complete' rather than creating a second user.
   */
  updateWrdoUsers(data: Record<string, unknown>): Promise<WrdoUserRecord | WrdoUserRecord[]>;
}

export interface GetOrCreateOptions {
  /** Human-readable name for the user when newly created. */
  displayName?: string | null;
  /** Channel-specific display handle (e.g. WhatsApp profile name). */
  channelDisplayName?: string | null;
  /** Mark the channel identity as verified. */
  verified?: boolean;
  /** registration_state to set on a newly created user (default 'pending'). */
  registrationState?: string;
  /** Consent flags + extra profile data stashed on the user. */
  marketingConsent?: boolean;
  serviceConsent?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateProfileOptions {
  /** Human-readable name. */
  displayName?: string | null;
  /** registration_state to set (e.g. 'complete'). */
  registrationState?: string;
  marketingConsent?: boolean;
  serviceConsent?: boolean;
  metadata?: Record<string, unknown> | null;
}

function first<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

export class WrdoUserService {
  constructor(private readonly dir: WrdoUserDirectory) {}

  /**
   * Resolve a channel + channel-specific identifier to the canonical wrdo_user,
   * creating it (and the channel identity row) on first contact.
   *
   * Idempotent under the UNIQUE (channel, channel_user_id) index: a second call
   * with the same pair returns the existing user without creating duplicates.
   */
  async getOrCreateByChannelIdentity(
    channel: Channel,
    channelUserId: string,
    options: GetOrCreateOptions = {},
  ): Promise<WrdoUserRecord> {
    // Exact-match idempotency: same (channel, phone) already linked -> return it.
    const existing = await this.getByChannelIdentity(channel, channelUserId);
    if (existing !== null) {
      return existing;
    }

    // Phone is the universal anchor. If this phone already exists on ANY OTHER
    // channel, the person already exists — LINK this channel to that user, never
    // create a duplicate. The phone IS the merge; there is no merge engine.
    const byPhone = await this.getByPhone(channelUserId);
    if (byPhone !== null) {
      await this.dir.createUserChannelIdentities({
        user_id: byPhone.id,
        channel,
        channel_user_id: channelUserId,
        display_name_on_channel: options.channelDisplayName ?? null,
        is_verified: options.verified ?? false,
      });
      return byPhone;
    }

    const user = first(
      await this.dir.createWrdoUsers({
        display_name: options.displayName ?? null,
        marketing_consent: options.marketingConsent ?? false,
        service_consent: options.serviceConsent ?? true,
        registration_state: options.registrationState ?? 'pending',
        metadata: options.metadata ?? null,
      }),
    );

    await this.dir.createUserChannelIdentities({
      user_id: user.id,
      channel,
      channel_user_id: channelUserId,
      display_name_on_channel: options.channelDisplayName ?? null,
      is_verified: options.verified ?? false,
    });

    return user;
  }

  /**
   * Guest-first (WRDO-180): ensure a wrdo_user row exists at FIRST contact so the
   * conversation spine has a stable user_id from message one.
   *
   * Delegates to getOrCreateByChannelIdentity with registrationState 'guest'.
   * IDEMPOTENT + NO-CLOBBER: getOrCreate only sets registration_state on the
   * CREATE branch — an existing user (guest OR complete) is returned untouched.
   * So calling this on every inbound message creates 'guest' once and is a clean
   * no-op afterwards; it never downgrades a 'complete' user back to 'guest'.
   *
   * @param channel - The inbound channel (typically 'whatsapp').
   * @param channelUserId - The channel identifier (the phone for whatsapp/web).
   * @returns The (existing or freshly created) wrdo_user.
   */
  async ensureGuest(channel: Channel, channelUserId: string): Promise<WrdoUserRecord> {
    return this.getOrCreateByChannelIdentity(channel, channelUserId, {
      registrationState: 'guest',
    });
  }

  /**
   * Update an existing wrdo_user's profile fields. Only provided fields are
   * written; omitted fields are left as-is. Used to PROMOTE a guest row to
   * 'complete' on consent (WRDO-180) rather than creating a second user.
   */
  async updateProfile(userId: string, options: UpdateProfileOptions): Promise<WrdoUserRecord> {
    const patch: Record<string, unknown> = { id: userId };
    if (options.displayName !== undefined) {
      patch['display_name'] = options.displayName;
    }
    if (options.registrationState !== undefined) {
      patch['registration_state'] = options.registrationState;
    }
    if (options.marketingConsent !== undefined) {
      patch['marketing_consent'] = options.marketingConsent;
    }
    if (options.serviceConsent !== undefined) {
      patch['service_consent'] = options.serviceConsent;
    }
    if (options.metadata !== undefined) {
      patch['metadata'] = options.metadata;
    }
    return first(await this.dir.updateWrdoUsers(patch));
  }

  /**
   * Promote the wrdo_user behind a channel identity to 'complete' on consent
   * (WRDO-180). Resolves the row by (channel, phone) — creating a guest first if
   * it somehow doesn't exist yet (e.g. ensureGuest was skipped) — then UPDATES it
   * in place. This is the consent-time replacement for the old create-on-consent
   * behaviour: a returning user's row is lifted, never duplicated.
   *
   * @param channel - The channel the consent arrived on (typically 'whatsapp').
   * @param channelUserId - The phone / channel identifier.
   * @param options - Profile fields to write (registrationState defaults to 'complete').
   * @returns The updated wrdo_user.
   */
  async promoteToComplete(
    channel: Channel,
    channelUserId: string,
    options: UpdateProfileOptions = {},
  ): Promise<WrdoUserRecord> {
    const user = await this.getOrCreateByChannelIdentity(channel, channelUserId, {
      displayName: options.displayName ?? null,
      channelDisplayName: options.displayName ?? null,
      registrationState: 'guest',
    });
    return this.updateProfile(user.id, {
      registrationState: 'complete',
      ...options,
    });
  }

  /**
   * Lookup-only. Returns the canonical wrdo_user for a channel identity, or null
   * when no identity row exists.
   */
  async getByChannelIdentity(
    channel: Channel,
    channelUserId: string,
  ): Promise<WrdoUserRecord | null> {
    const identities = await this.dir.listUserChannelIdentities({
      channel,
      channel_user_id: channelUserId,
    });
    const identity = identities[0];
    if (identity === undefined) {
      return null;
    }
    return this.dir.retrieveWrdoUser(identity.user_id);
  }

  /**
   * Cross-channel lookup by phone (channel_user_id) across ALL channels. Returns
   * the canonical wrdo_user that owns ANY identity with this phone, or null.
   *
   * Convention: channel_user_id IS the phone for whatsapp AND web — so a phone
   * seen on either channel resolves to the same person. This is the load-bearing
   * identity invariant: link, never duplicate.
   */
  private async getByPhone(phone: string): Promise<WrdoUserRecord | null> {
    const identities = await this.dir.listUserChannelIdentities({
      channel_user_id: phone,
    });
    const identity = identities[0];
    if (identity === undefined) {
      return null;
    }
    return this.dir.retrieveWrdoUser(identity.user_id);
  }
}
