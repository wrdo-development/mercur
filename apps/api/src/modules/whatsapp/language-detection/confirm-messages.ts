/**
 * Confirmation nudge strings per language (Day-1 languages).
 * Tier 3 languages (ss, nr, ve, ts, nd, bem) fall back to English nudge via getConfirmNudge → null.
 */

export const CONFIRM_NUDGES: Record<string, string> = {
  af: 'Hallo! Kan ek in Afrikaans antwoord?',
  zu: 'Sawubona! Ngingakhuluma isiZulu?',
  xh: 'Molo! Ndingaphendula ngesiXhosa?',
  ny: 'Moni! Ndikuyankhe Chichewa?',
  st: 'Dumela! Nka araba ka Sesotho?',
  sn: 'Mhoro! Ndingatauridzira neChiShona?',
  tn: 'Dumela! A nka araba ka Setswana?',
  sw: 'Habari! Niweze kujibu kwa Kiswahili?',
  pt: 'Olá! Posso continuar em Português?',
  de: 'Hallo! Kann ich auf Deutsch antworten?',
  fr: 'Bonjour! Je peux continuer en Français?',
  es: '¡Hola! ¿Puedo continuar en Español?',
  zh: '你好！我可以用中文回复吗？',
  ar: 'مرحبا! هل يمكنني الرد بالعربية؟',
};

export const BILINGUAL_GREETINGS: Record<string, string> = {
  // For short messages (≤3 tokens) — mirror + English offer
  ny: 'Ehe! / Yes! Ndingakuthandizeni? / How can I help?',
  zu: 'Yebo! / Yes! Ngingakusiza ngani? / How can I help?',
  xh: 'Ewe! / Yes! Ndingakunceda njani? / How can I help?',
  af: 'Ja! / Yes! Hoe kan ek help? / How can I help?',
  st: 'Eya! / Yes! Nka thusa jang? / How can I help?',
  sn: 'Hongu! / Yes! Ndingarwadziswa sei? / How can I help?',
  tn: 'Ee! / Yes! Ke ka thusa jang? / How can I help?',
  sw: 'Ndiyo! / Yes! Ninaweza kukusaidia vipi? / How can I help?',
};

export function getConfirmNudge(langCode: string): string | null {
  const entry = Object.entries(CONFIRM_NUDGES).find(([k]) => k === langCode);
  return entry ? entry[1] : null;
}

export function getBilingualGreeting(langCode: string): string | null {
  const entry = Object.entries(BILINGUAL_GREETINGS).find(([k]) => k === langCode);
  return entry ? entry[1] : null;
}
