/**
 * Strong markers and bigram hints for the language inferrer.
 * Extracted to keep language-inferrer.data.ts within the 300-line limit.
 */

import type { Language } from './language-inferrer.data.js';

/** Tokens that, if present, strongly indicate a specific language. */
export const STRONG_MARKERS: Record<Language, string[]> = {
  en: ['hello', 'thanks', 'please'],
  af: ['hallo', 'asseblief', 'dankie', 'hoekom', 'fooi', 'betaal'],
  pt: ['olá', 'obrigado', 'obrigada', 'desculpe', 'português'],
  de: ['hallo', 'danke', 'bitte', 'entschuldigung', 'deutsch'],
  fr: ['bonjour', 'merci', 'bonsoir', 'excusez', 'français'],
  es: ['hola', 'gracias', 'buenos días', 'buenas', 'español'],
  zh: [],
  ar: [],
  sw: ['habari', 'asante', 'karibu', 'jambo', 'swahili', 'kiswahili', 'saidia', 'lipa'],
  zu: ['sawubona', 'ngiyabonga', 'unjani', 'thipa', 'khokha', 'siza'],
  xh: ['molo', 'molweni', 'enkosi', 'unjani', 'nceda', 'hlawula'],
  st: ['dumela', 'leboha', 'lebohela', 'thusa', 'lefa', 'tjhee', 'haholo', 'hobaneng'],
  tn: ['dumela', 'pula', 'ke a leboga', 'tswana'],
  nso: ['dumelang', 'ke a leboha', 'sepedi', 'leboha'],
  sn: ['mhoro', 'mazvita', 'makadii'],
  ny: ['moni', 'bwanji', 'zikomo', 'thandiza', 'malipiro'],
  ss: ['siyabonga', 'siswati', 'umntfwana', 'siyachela'],
  nr: ['indebele', 'isiNdebele', 'nginamathela'],
  ve: ['ndaa', 'masiari', 'tshivenda', 'vhutshilo', 'mudzulatshidulo'],
  ts: ['xewani', 'avuxeni', 'ndza khensa', 'xitsonga', 'mhaka'],
  nd: ['ndebele', 'zimbabwe'],
  bem: ['natotela', 'muli bwino', 'bemba', 'icibemba', 'bushe'],
};

/**
 * Character-bigram fingerprints used as a soft tiebreaker. Each language gets a
 * small list of bigrams that are unusually common in it; we award a small score
 * per matching occurrence, capped so it never overrides direct word matches.
 */
export const BIGRAM_HINTS: Record<Language, string[]> = {
  en: ['th', 'he', 'in', 'er', 'an'],
  af: ['aa', 'ee', 'ie', 'oe', 'ui'],
  pt: ['ão', 'qu', 'nh', 'lh', 'ão'],
  de: ['ei', 'ch', 'ie', 'sch', 'ng'],
  fr: ['ou', 'au', 'eu', 'qu', 'oi'],
  es: ['ci', 'ón', 'es', 'ar', 'al'],
  zh: [],
  ar: [],
  sw: ['wa', 'na', 'ku', 'si', 'mb'],
  zu: ['nk', 'nh', 'nj', 'hl', 'mb'],
  xh: ['nk', 'nh', 'nj', 'hl', 'ng'],
  st: ['ts', 'ha', 'le', 'ho', 'ke'],
  tn: ['ts', 'wa', 'le', 'go', 'ke'],
  nso: ['le', 'go', 'ke', 'tš', 'ng'],
  sn: ['nd', 'sv', 'zv', 'mh', 'ng'],
  ny: ['mu', 'wa', 'ku', 'nd', 'zi'],
  ss: ['nj', 'mb', 'nt', 'ng', 'sw'],
  nr: ['nd', 'mb', 'nj', 'hl', 'ng'],
  ve: ['vh', 'nd', 'ts', 'zw', 'ng'],
  ts: ['nk', 'ts', 'sw', 'kh', 'xa'],
  nd: ['nd', 'mb', 'nj', 'hl', 'ng'],
  bem: ['mu', 'ba', 'ng', 'ku', 'sh'],
};
