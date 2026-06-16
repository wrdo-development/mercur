/**
 * Language inference from message text.
 *
 * Copied from @wrdo/soul src/active/language-inferrer.ts — intentionally
 * not imported because tribe-api does not yet depend on @wrdo/soul (Phase 1).
 * Sync with soul's version when @wrdo/soul is added as a dep (Phase 2).
 *
 * Static data tables (STOPWORDS, STRONG_MARKERS, BIGRAM_HINTS) live in
 * language-inferrer.data.ts to keep this file within the 300-line limit.
 */

import {
  BIGRAM_HINTS,
  type Language,
  STOPWORDS,
  STRONG_MARKERS,
  SUPPORTED,
} from './language-inferrer.data';

export type { Language } from './language-inferrer.data';
export { SUPPORTED } from './language-inferrer.data';

const CONFIDENCE_THRESHOLD = 0.6;

export interface LanguageInference {
  language: string; // language code: 'en', 'af', 'zu', 'ny', 'tn', 'sw', etc.
  confidence: number; // 0–1
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function countBigramHits(text: string, bigrams: string[]): number {
  const lower = text.toLowerCase();
  let total = 0;
  for (const bg of bigrams) {
    let idx = lower.indexOf(bg);
    while (idx !== -1) {
      total += 1;
      idx = lower.indexOf(bg, idx + 1);
    }
  }
  return total;
}

/**
 * Returns the fraction of characters in `text` that fall within the given
 * Unicode range [start, end] (inclusive).
 */
function scriptFraction(text: string, start: number, end: number): number {
  if (text.length === 0) {
    return 0;
  }
  let count = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= start && cp <= end) {
      count += 1;
    }
  }
  return count / text.length;
}

type ScoreAdder = (lang: string, delta: number) => void;

function scoreStopwords(tokenSet: Set<string>, add: ScoreAdder): void {
  for (const [lang, words] of Object.entries(STOPWORDS)) {
    for (const word of words) {
      if (tokenSet.has(word)) {
        add(lang, 1);
      }
    }
  }
}

function scoreMarkers(trimmedLower: string, tokenSet: Set<string>, add: ScoreAdder): void {
  for (const [lang, markers] of Object.entries(STRONG_MARKERS)) {
    for (const marker of markers) {
      if (marker.includes(' ')) {
        if (trimmedLower.includes(marker.toLowerCase())) {
          add(lang, 5);
        }
      } else {
        if (tokenSet.has(marker.toLowerCase())) {
          add(lang, 5);
        }
      }
    }
  }
}

/** Compute per-language scores from stopwords, markers, and bigrams. */
function scoreLanguages(trimmed: string, tokenSet: Set<string>): Map<string, number> {
  const scoreMap = new Map<string, number>(SUPPORTED.map((l) => [l, 0]));
  const add: ScoreAdder = (lang, delta) => {
    scoreMap.set(lang, (scoreMap.get(lang) ?? 0) + delta);
  };

  scoreStopwords(tokenSet, add);
  scoreMarkers(trimmed.toLowerCase(), tokenSet, add);

  for (const [lang, bigrams] of Object.entries(BIGRAM_HINTS)) {
    add(lang, Math.min(countBigramHits(trimmed, bigrams) * 0.2, 2));
  }

  return scoreMap;
}

/** Pick best language and compute normalised confidence from a score map. */
function pickBest(scoreMap: Map<string, number>): { bestLang: Language; confidence: number } {
  let bestLang: Language = 'en';
  let bestScore = 0;
  let totalScore = 0;
  for (const lang of SUPPORTED) {
    const s = scoreMap.get(lang) ?? 0;
    totalScore += s;
    if (s > bestScore) {
      bestScore = s;
      bestLang = lang;
    }
  }
  return { bestLang, confidence: totalScore > 0 ? bestScore / totalScore : 0 };
}

export function inferLanguageFromMessage(messageText: string): LanguageInference {
  const trimmed = messageText.trim();
  if (trimmed.length === 0) {
    return { language: 'en', confidence: 0 };
  }

  // Script-based fast paths for CJK and Arabic.
  if (scriptFraction(trimmed, 0x4e00, 0x9fff) > 0.3) {
    return { language: 'zh', confidence: 0.95 };
  }
  if (scriptFraction(trimmed, 0x0600, 0x06ff) > 0.3) {
    return { language: 'ar', confidence: 0.95 };
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return { language: 'en', confidence: 0 };
  }

  const { bestLang, confidence } = pickBest(scoreLanguages(trimmed, new Set(tokens)));

  if (confidence < CONFIDENCE_THRESHOLD) {
    return { language: 'en', confidence };
  }
  return { language: bestLang, confidence };
}
