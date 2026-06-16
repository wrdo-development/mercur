/**
 * Language detection + confirmation service.
 * Orchestrates inference, profile storage, and nudge replies.
 */

import { getBilingualGreeting, getConfirmNudge } from './confirm-messages';
import { inferLanguageFromMessage } from './language-inferrer';
import {
  defaultProfile,
  type LanguageProfile,
  type LanguageProfileStore,
} from './language-profile.store';

export interface LanguageDetectionDeps {
  store: LanguageProfileStore;
}

export interface LanguageDetectionResult {
  // null = no action needed (profile already confirmed, or English)
  // string = send this as the WRDO reply before the normal pipeline
  confirmationReply: string | null;
  profile: LanguageProfile;
}

/** Detect explicit user override commands (no LLM — pure string matching). */
function detectOverrideIntent(
  text: string,
):
  | { type: 'set'; language: string }
  | { type: 'clear' }
  | { type: 'prefer'; language: string }
  | null {
  const lower = text.toLowerCase().trim();

  // "speak english please" / "english only" / "use english"
  if (
    /\bspeak\s+english\b/i.test(lower) ||
    /\benglish\s+only\b/i.test(lower) ||
    /\buse\s+english\b/i.test(lower) ||
    /\bonly\s+english\b/i.test(lower)
  ) {
    return { type: 'set', language: 'en' };
  }

  // "detect automatically" / "/autodetect" / "you can speak X now" (with Chichewa/specific lang)
  if (
    /\/autodetect\b/i.test(lower) ||
    /\bdetect\s+automatically\b/i.test(lower) ||
    /\bauto[\s-]?detect\b/i.test(lower)
  ) {
    return { type: 'clear' };
  }

  // "you can speak X now" — clear override, user wants detected language back
  const speakMatch = lower.match(/\byou\s+can\s+speak\s+(\w+)\s+now\b/i);
  if (speakMatch !== null) {
    return { type: 'clear' };
  }

  // "i speak X not Y" — update preferred language
  const iSpeakMatch = text.match(/\bi\s+speak\s+(\w+)\s+not\b/i);
  if (iSpeakMatch !== null) {
    const langName = iSpeakMatch[1].toLowerCase();
    const langCode = resolveLangName(langName);
    if (langCode !== null) {
      return { type: 'prefer', language: langCode };
    }
  }

  return null;
}

/** Map common language names/endonyms to codes. */
function resolveLangName(name: string): string | null {
  const map: Record<string, string> = {
    english: 'en',
    afrikaans: 'af',
    zulu: 'zu',
    isizulu: 'zu',
    xhosa: 'xh',
    isixhosa: 'xh',
    chichewa: 'ny',
    nyanja: 'ny',
    sesotho: 'st',
    sotho: 'st',
    shona: 'sn',
    chishona: 'sn',
    setswana: 'tn',
    tswana: 'tn',
    swahili: 'sw',
    kiswahili: 'sw',
    portuguese: 'pt',
    german: 'de',
    french: 'fr',
    spanish: 'es',
    chinese: 'zh',
    mandarin: 'zh',
    arabic: 'ar',
    sepedi: 'nso',
    pedi: 'nso',
    nso: 'nso',
    siswati: 'ss',
    swati: 'ss',
    ndebele: 'nr',
    isindebele: 'nr',
    venda: 've',
    tshivenda: 've',
    tsonga: 'ts',
    xitsonga: 'ts',
    zimbabwe: 'nd',
    bemba: 'bem',
    icibemba: 'bem',
  };
  const entry = Object.entries(map).find(([k]) => k === name);
  return entry ? entry[1] : null;
}

export class LanguageDetectionService {
  constructor(private readonly deps: LanguageDetectionDeps) {}

  /** Apply an explicit override intent (set/clear/prefer) and persist. */
  private async applyOverrideIntent(
    userId: string,
    profile: LanguageProfile,
    intent: ReturnType<typeof detectOverrideIntent> & object,
  ): Promise<LanguageDetectionResult> {
    if (intent.type === 'set') {
      profile.userOverride = intent.language;
      profile.confirmed = true;
      profile.preferred = intent.language;
    } else if (intent.type === 'clear') {
      profile.userOverride = null;
      profile.confirmed = false;
    } else {
      // 'prefer'
      profile.preferred = intent.language;
      profile.confirmed = true;
      profile.userOverride = null;
    }
    profile.pendingConfirmation = false;
    await this.deps.store.set(userId, profile);
    return { confirmationReply: null, profile };
  }

  /** Handle a short message (≤3 tokens) — update counts and fire nudges. */
  private async processShortMessage(
    userId: string,
    profile: LanguageProfile,
    messageText: string,
  ): Promise<LanguageDetectionResult> {
    profile.shortMessageCount += 1;
    const inference = inferLanguageFromMessage(messageText);

    if (inference.confidence > 0.8 && inference.language !== 'en') {
      if (!profile.detectedMix.includes(inference.language)) {
        profile.detectedMix.push(inference.language);
      }
      if (profile.preferred === 'en') {
        profile.preferred = inference.language;
      }
      if (profile.shortMessageCount >= 3) {
        profile.pendingConfirmation = true;
        profile.nudgeSentAt = new Date().toISOString();
        await this.deps.store.set(userId, profile);
        return { confirmationReply: getConfirmNudge(inference.language), profile };
      }
      await this.deps.store.set(userId, profile);
      return { confirmationReply: getBilingualGreeting(inference.language), profile };
    }

    if (profile.shortMessageCount >= 3 && profile.preferred !== 'en') {
      profile.pendingConfirmation = true;
      profile.nudgeSentAt = new Date().toISOString();
      await this.deps.store.set(userId, profile);
      return { confirmationReply: getConfirmNudge(profile.preferred), profile };
    }

    await this.deps.store.set(userId, profile);
    return { confirmationReply: null, profile };
  }

  /** Resolve a pending language confirmation from a substantive reply. Mutates profile in place. */
  private resolvePendingConfirmation(
    profile: LanguageProfile,
    inference: { language: string; confidence: number },
  ): void {
    if (inference.language === profile.preferred && inference.confidence > 0.5) {
      profile.confirmed = true;
      profile.confirmedAt = new Date().toISOString();
      profile.pendingConfirmation = false;
    } else if (inference.language === 'en') {
      profile.confirmed = true;
      profile.preferred = 'en';
      profile.pendingConfirmation = false;
    } else {
      profile.preferred = inference.language;
      profile.pendingConfirmation = false;
      profile.confirmed = true;
      if (!profile.detectedMix.includes(inference.language)) {
        profile.detectedMix.push(inference.language);
      }
    }
  }

  /** Handle a substantive message (>3 tokens) — pending confirmation or fresh detection. */
  private async processSubstantiveMessage(
    userId: string,
    profile: LanguageProfile,
    messageText: string,
  ): Promise<LanguageDetectionResult> {
    profile.shortMessageCount = 0;
    const inference = inferLanguageFromMessage(messageText);

    if (profile.pendingConfirmation) {
      this.resolvePendingConfirmation(profile, inference);
      await this.deps.store.set(userId, profile);
      return { confirmationReply: null, profile };
    }

    if (inference.confidence > 0.7 && inference.language !== 'en') {
      if (!profile.detectedMix.includes(inference.language)) {
        profile.detectedMix.push(inference.language);
      }
      profile.preferred = inference.language;
      profile.pendingConfirmation = true;
      profile.nudgeSentAt = new Date().toISOString();
      await this.deps.store.set(userId, profile);
      return { confirmationReply: getConfirmNudge(inference.language), profile };
    }

    if (
      inference.confidence >= 0.4 &&
      inference.confidence <= 0.75 &&
      !profile.detectedMix.includes(inference.language)
    ) {
      profile.detectedMix.push(inference.language);
    }

    await this.deps.store.set(userId, profile);
    return { confirmationReply: null, profile };
  }

  /**
   * Process incoming message for language detection.
   * Returns a confirmationReply if WRDO should send a language nudge.
   * Returns null confirmationReply if normal pipeline should proceed.
   */
  async processMessage(userId: string, messageText: string): Promise<LanguageDetectionResult> {
    const stored = await this.deps.store.get(userId);
    const profile = stored ?? defaultProfile('en');

    const overrideIntent = detectOverrideIntent(messageText);
    if (overrideIntent !== null) {
      return this.applyOverrideIntent(userId, profile, overrideIntent);
    }

    if (profile.userOverride !== null) {
      return { confirmationReply: null, profile };
    }
    if (profile.confirmed) {
      return { confirmationReply: null, profile };
    }

    const tokenCount = messageText.trim().split(/\s+/).filter(Boolean).length;
    if (tokenCount <= 3) {
      return this.processShortMessage(userId, profile, messageText);
    }

    return this.processSubstantiveMessage(userId, profile, messageText);
  }

  /**
   * Explicitly set or clear the user's language override.
   * override = null means "detect automatically again".
   */
  async processOverride(userId: string, override: string | null): Promise<void> {
    const stored = await this.deps.store.get(userId);
    const profile = stored ?? defaultProfile('en');
    profile.userOverride = override;
    if (override !== null) {
      profile.preferred = override;
      profile.confirmed = true;
    } else {
      profile.confirmed = false;
      profile.pendingConfirmation = false;
    }
    await this.deps.store.set(userId, profile);
  }
}
