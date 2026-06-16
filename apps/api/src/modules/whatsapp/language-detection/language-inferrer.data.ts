/**
 * Static language data tables for the language inferrer.
 * Extracted to keep language-inferrer.ts within the 300-line limit.
 * Also exports the SUPPORTED array and Language type to avoid circular imports.
 *
 * STOPWORDS → language-inferrer.stopwords.ts
 * STRONG_MARKERS + BIGRAM_HINTS → language-inferrer.markers.ts
 */

export const SUPPORTED = [
  // Tier 1
  'en',
  'af',
  'pt',
  'de',
  'fr',
  'es',
  'zh',
  'ar',
  'sw',
  // Tier 2
  'zu',
  'xh',
  'st',
  'tn',
  'nso',
  'sn',
  'ny',
  // Tier 3
  'ss',
  'nr',
  've',
  'ts',
  'nd',
  'bem',
] as const;

export type Language = (typeof SUPPORTED)[number];

export { BIGRAM_HINTS, STRONG_MARKERS } from './language-inferrer.markers.js';
// Re-export all data tables so consumers only need to import from this file.
export { STOPWORDS } from './language-inferrer.stopwords.js';
