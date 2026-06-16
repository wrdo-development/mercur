/**
 * Classify a feedback reply into a signal type.
 * Pure function — no I/O, no LLM. Local pattern matching only.
 */

export type FeedbackSignal =
  | 'language_correction'
  | 'content_error'
  | 'confusion'
  | 'translation_quality'
  | 'general';

const CONFUSION_PATTERNS = [
  /^[❓?]+$/,
  /^(what|who|huh|excuse me|say what|sorry)[?!]?$/i,
  /^(what is this|who is this|why did|i didn.?t)[?!]?$/i,
];

const LANGUAGE_CORRECTION_PATTERNS = [
  /i speak (\w+)/i,
  /i.?m (\w+)/i,
  /use (\w+) please/i,
  /respond in (\w+)/i,
  /not (zulu|xhosa|afrikaans|chichewa|sesotho|shona|setswana|swahili|english)/i,
  /wrong language/i,
  /taal verkeerd/i, // Afrikaans: language wrong
  /sikhuluma isiZulu/i, // Zulu
];

const TRANSLATION_QUALITY_PATTERNS = [
  /translation/i,
  /this doesn.?t make sense/i,
  /wrong translation/i,
  /bad translation/i,
  /vertaling verkeerd/i, // Afrikaans: translation wrong
  /isintu/i,
];

const CONTENT_ERROR_PATTERNS = [
  /wrong amount/i,
  /i didn.?t (book|order|request)/i,
  /not (my|the right)/i,
  /incorrect/i,
  /this is wrong/i,
  /fout bedrag/i, // Afrikaans: wrong amount
  /inani elingalungile/i, // Zulu: wrong amount
];

export function classifyFeedback(replyText: string, _quotedMessage: string): FeedbackSignal {
  const trimmed = replyText.trim();

  if (CONFUSION_PATTERNS.some((p) => p.test(trimmed))) {
    return 'confusion';
  }
  if (LANGUAGE_CORRECTION_PATTERNS.some((p) => p.test(trimmed))) {
    return 'language_correction';
  }
  if (TRANSLATION_QUALITY_PATTERNS.some((p) => p.test(trimmed))) {
    return 'translation_quality';
  }
  if (CONTENT_ERROR_PATTERNS.some((p) => p.test(trimmed))) {
    return 'content_error';
  }
  return 'general';
}
