/**
 * Two-way review flow constants — signal tags, copy, visibility tiers.
 *
 * WHY
 *   Locked 2026-05-11 by Alwyn (memory: project_wrdo_two_way_reviews.md):
 *   workers review residents and residents review workers. Worker dignity is
 *   the load-bearing principle — the provider-reviewing-resident copy must
 *   never read as punitive or formal. It's a "How was working with X? Just
 *   a couple of quick tags help future providers" tone.
 *
 * SIGNAL TAG LISTS
 *   Asymmetric on purpose. The resident-→-provider list is the standard
 *   service quality lens (was the work good? on time? fair price?). The
 *   provider-→-resident list inverts and adds the lower-threshold flags
 *   the worker dignity rules require: late_payment, unsafe_environment,
 *   etc. — these can land in `visibility = 'leader_only'` and trigger
 *   triage_status='pending' on insert.
 *
 * VISIBILITY TIERS
 *   - public         — visible to all residents browsing the worker's profile
 *   - provider_only  — visible only to OTHER providers (worker-only intel)
 *   - leader_only    — flagged to Alwyn (serious: abuse, wage theft,
 *                      discrimination); triggers triage_status='pending'
 */

/** Tags a RESIDENT picks when reviewing a PROVIDER. */
export const RESIDENT_TO_PROVIDER_TAGS = [
  'great_communication',
  'on_time',
  'professional',
  'reasonable_price',
  'quality_work',
  'went_above_and_beyond',
  'poor_quality',
  'late_arrival',
  'no_show',
  'overcharged',
  'unprofessional',
] as const;

export type ResidentToProviderTag = (typeof RESIDENT_TO_PROVIDER_TAGS)[number];

/** Tags a PROVIDER picks when reviewing a RESIDENT. */
export const PROVIDER_TO_RESIDENT_TAGS = [
  'pays_on_time',
  'clear_brief',
  'respectful',
  'fair',
  'easy_to_work_with',
  'flexible',
  'late_payment',
  'unrealistic_expectations',
  'rude_or_disrespectful',
  'unsafe_environment',
  'wage_theft',
  'discrimination',
] as const;

export type ProviderToResidentTag = (typeof PROVIDER_TO_RESIDENT_TAGS)[number];

/** Serious flags from the provider→resident list that ESCALATE to leader_only. */
export const LEADER_ONLY_TAGS: ReadonlySet<ProviderToResidentTag> = new Set<ProviderToResidentTag>([
  'wage_theft',
  'discrimination',
  'unsafe_environment',
]);

/** Visibility tier values stored on the review row. */
export const REVIEW_VISIBILITY = ['public', 'provider_only', 'leader_only'] as const;
export type ReviewVisibility = (typeof REVIEW_VISIBILITY)[number];

/** Subject_kind values — who is being reviewed. */
export const REVIEW_SUBJECT_KIND = ['provider', 'resident'] as const;
export type ReviewSubjectKind = (typeof REVIEW_SUBJECT_KIND)[number];

/** Author_kind values — who is writing the review. */
export const REVIEW_AUTHOR_KIND = ['provider', 'resident'] as const;
export type ReviewAuthorKind = (typeof REVIEW_AUTHOR_KIND)[number];

/** Triage status — only set when visibility = 'leader_only'. */
export const REVIEW_TRIAGE_STATUS = [
  'pending',
  'leader_reviewed',
  'resolved',
  'dismissed',
] as const;
export type ReviewTriageStatus = (typeof REVIEW_TRIAGE_STATUS)[number];

/** Hard cap on free-text comment length (matches DB nvarchar guidance). */
export const REVIEW_COMMENT_MAX_LENGTH = 500;

/** Min and max rating values (inclusive). */
export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;

/** Flow JSON identifiers — registered on Meta Cloud, referenced by handler. */
export const REVIEW_FLOW_NAMES = {
  residentReviewsProvider: 'review_provider_v1',
  providerReviewsResident: 'review_resident_v1',
} as const;

/** Delay between booking completion and review prompt being sent. */
export const REVIEW_PROMPT_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Review flow steps for the conversational (text) fallback path.
 * The Meta Flow JSON is the primary UX; this is what we walk users through
 * when they can't render Flow JSON (older WA clients, debug mode, etc.).
 */
export const REVIEW_STEPS = [
  'collect_rating',
  'collect_signal_tags',
  'collect_comment',
  'collect_visibility', // provider→resident only
  'complete',
] as const;

export type ReviewStep = (typeof REVIEW_STEPS)[number];

/** Review flow identifier — set on conversation state. */
export const REVIEW_FLOW_RESIDENT_TO_PROVIDER = 'review_resident_to_provider';
export const REVIEW_FLOW_PROVIDER_TO_RESIDENT = 'review_provider_to_resident';

export type ReviewFlowKind =
  | typeof REVIEW_FLOW_RESIDENT_TO_PROVIDER
  | typeof REVIEW_FLOW_PROVIDER_TO_RESIDENT;

/**
 * WRDO-voiced copy for the conversational fallback.
 * Tone:
 *   - resident→provider: standard service-quality language
 *   - provider→resident: warm, non-punitive, "help future providers" framing
 */
export const REVIEW_PROMPTS = {
  resident_to_provider: {
    intro: (providerName: string): string =>
      `Hope you had a good experience with ${providerName}! Quick review takes 30 seconds — can I ask?`,
    collect_rating: 'How was it? Tap a rating from 1 (rough) to 5 (excellent).',
    collect_signal_tags: 'What stood out? You can tick a few:',
    collect_comment: 'Anything else you want to add? Type a quick note, or send "skip" to finish.',
    complete: 'Thanks! Your review helps other neighbours find good people. 💚',
  },
  provider_to_resident: {
    intro: (residentName: string): string =>
      `How was working with ${residentName}? Just a couple of quick tags help future providers know what to expect.`,
    collect_rating: 'Overall, how was it? Tap a rating from 1 to 5.',
    collect_signal_tags:
      'Anything stand out? Tick a few — your feedback stays private to other providers if you choose.',
    collect_comment:
      'Anything else providers should know? Type a quick note, or send "skip" to finish.',
    collect_visibility:
      'Who can see this? Reply: PUBLIC (everyone), PROVIDERS (other workers only), or LEADER (serious — only Alwyn sees).',
    complete: 'Thanks! This stays useful — workers look out for each other on WRDO.',
  },
} as const;

/** Headline copy used on the Flow JSON CTA button. */
export const REVIEW_FLOW_CTA = {
  resident_to_provider: 'Leave a review',
  provider_to_resident: 'Share your experience',
} as const;

/** Body text shown above the flow CTA button on WhatsApp. */
export const REVIEW_FLOW_BODY = {
  resident_to_provider: (providerName: string): string =>
    `Booking with ${providerName} is wrapped up. Tap below to leave a quick review — it takes 30 seconds and helps your neighbours.`,
  provider_to_resident: (residentName: string): string =>
    `How was the job with ${residentName}? A quick tap below helps other providers know what to expect. Stays private if you choose.`,
} as const;

/** Map a signal-tag input string to its canonical form (lowercase, snake_case). */
export function normaliseSignalTag(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/g, '_');
}

/**
 * Returns true when at least one of the supplied tags requires leader_only
 * visibility (i.e. it's a serious dignity-level flag).
 */
export function tagsRequireLeaderTriage(
  tags: readonly string[],
  authorKind: ReviewAuthorKind,
): boolean {
  if (authorKind !== 'provider') {
    // Resident-→-provider reviews never auto-route to leader_only via tags.
    return false;
  }
  return tags.some((t) => LEADER_ONLY_TAGS.has(t as ProviderToResidentTag));
}

/**
 * Returns true when the given tag list is valid for the given author kind
 * (each tag must be in the allow-list for that direction).
 */
export function isValidTagSet(tags: readonly string[], authorKind: ReviewAuthorKind): boolean {
  const allowed: ReadonlySet<string> =
    authorKind === 'provider'
      ? new Set<string>(PROVIDER_TO_RESIDENT_TAGS)
      : new Set<string>(RESIDENT_TO_PROVIDER_TAGS);
  return tags.every((t) => allowed.has(t));
}
