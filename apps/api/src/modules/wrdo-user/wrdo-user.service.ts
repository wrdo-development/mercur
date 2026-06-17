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
    const existing = await this.getByChannelIdentity(channel, channelUserId);
    if (existing !== null) {
      return existing;
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
}
