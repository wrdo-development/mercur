/**
 * FAQ corpus for registration flows.
 * Used by Tier 1 FAQ classification when user asks questions mid-flow.
 */

export interface FaqEntry {
  keywords: string[];
  question: string;
  answer: string;
}

/** Registration FAQs — WRDO voice, SA slang where appropriate. */
export const REGISTRATION_FAQ_CORPUS: FaqEntry[] = [
  {
    keywords: ['how long', 'take', 'minutes', 'hours'],
    question: 'How long does registration take?',
    answer:
      "Just a few minutes! We'll need your name, a quick selfie, and your location. Easy as. 😊",
  },
  {
    keywords: ['free', 'cost', 'pay', 'money'],
    question: 'Is this free?',
    answer:
      'Yep! Registering with WRDO is completely free. You only pay when you book a service. 💚',
  },
  {
    keywords: ['what is', 'wrdo', 'who are'],
    question: 'What is WRDO?',
    answer:
      "WRDO connects you with trusted local service providers — plumbers, gardeners, tutors, you name it. We're your hyperlocal helper! 🏘️",
  },
  {
    keywords: ['data', 'privacy', 'used', 'store'],
    question: 'How is my data used?',
    answer:
      'We only use your info to connect you with providers and improve your experience. We never sell your data. Our Privacy Policy has the full details.',
  },
  {
    keywords: ['skip', 'steps', 'optional'],
    question: 'Can I skip steps?',
    answer:
      "Sorry, we need each step to verify you and keep things safe for everyone. It's quick, I promise! 🙏",
  },
  {
    keywords: ['areas', 'cover', 'where', 'serve'],
    question: 'What areas do you cover?',
    answer:
      "We're growing! Share your location and we'll let you know if you're in our service area. More areas coming soon! 💚",
  },
];
