/**
 * Redis-backed storage for user language profiles.
 * Key: lang_profile:{userId}, TTL: 90 days.
 */

import type { RedisAdapter } from '../idempotency.service';

const KEY_PREFIX = 'lang_profile:';
const TTL_SECONDS = 90 * 24 * 60 * 60; // 7,776,000 seconds — 90 days

export interface LanguageProfile {
  preferred: string; // language code
  confirmed: boolean;
  userOverride: string | null; // explicit "speak English please"
  codeSwitchPattern: 'free_switch' | 'monolingual' | 'en_dominant' | 'no_sa_substrate';
  saCulturalSubstrate: boolean;
  britishRegister: boolean;
  detectedMix: string[]; // all languages observed
  confirmedAt: string | null;
  pendingConfirmation: boolean; // true while waiting for user response to nudge
  nudgeSentAt: string | null; // ISO timestamp
  shortMessageCount: number; // consecutive short messages (≤3 tokens), reset on substantive msg
}

export interface LanguageProfileStore {
  get(userId: string): Promise<LanguageProfile | null>;
  set(userId: string, profile: LanguageProfile): Promise<void>;
  /** Update a partial set of fields */
  patch(userId: string, updates: Partial<LanguageProfile>): Promise<void>;
}

export function defaultProfile(preferred = 'en'): LanguageProfile {
  return {
    preferred,
    confirmed: false,
    userOverride: null,
    codeSwitchPattern: 'no_sa_substrate',
    saCulturalSubstrate: false,
    britishRegister: false,
    detectedMix: [],
    confirmedAt: null,
    pendingConfirmation: false,
    nudgeSentAt: null,
    shortMessageCount: 0,
  };
}

export function createLanguageProfileStore(redis: RedisAdapter): LanguageProfileStore {
  const key = (userId: string): string => `${KEY_PREFIX}${userId}`;

  return {
    async get(userId: string): Promise<LanguageProfile | null> {
      const raw = await redis.get(key(userId));
      if (raw === null) {
        return null;
      }
      try {
        return JSON.parse(raw) as LanguageProfile;
      } catch {
        return null;
      }
    },

    async set(userId: string, profile: LanguageProfile): Promise<void> {
      await redis.set(key(userId), JSON.stringify(profile), 'EX', String(TTL_SECONDS));
    },

    async patch(userId: string, updates: Partial<LanguageProfile>): Promise<void> {
      const raw = await redis.get(key(userId));
      let existing: LanguageProfile;
      if (raw === null) {
        existing = defaultProfile();
      } else {
        try {
          existing = JSON.parse(raw) as LanguageProfile;
        } catch {
          existing = defaultProfile();
        }
      }
      const updated = { ...existing, ...updates };
      await redis.set(key(userId), JSON.stringify(updated), 'EX', String(TTL_SECONDS));
    },
  };
}
