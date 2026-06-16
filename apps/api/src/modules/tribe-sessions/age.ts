/**
 * Age + date-of-birth helpers for registration and the SA age gate.
 *
 * Two concerns live here:
 *   1. Turning a user's input (a typed birthday OR an SA ID number) into a
 *      canonical "YYYY-MM-DD" date of birth.
 *   2. Deriving age-graded capability from that DOB, per South African law.
 *
 * ── Legal model (SA) ─────────────────────────────────────────────────────────
 * Contractual capacity is age-graded (Children's Act 38 of 2005, s17):
 *   • under 7  → no contractual capacity at all (treated here as a mis-entry).
 *   • 7–17     → LIMITED capacity. May contract, but obligations technically
 *                need guardian assistance. Platform decision (recorded
 *                2026-06-03): minors are allowed to transact for everything
 *                EXCEPT statutorily age-restricted goods. This carries some
 *                unassisted-minor contract exposure (WRDO is bound, the minor
 *                may not be) — accepted deliberately to keep friction low.
 *                Tighten via `ageBand` consumers if that posture changes.
 *   • 18+      → full capacity.
 * Age-restricted goods (alcohol, tobacco) are a hard 18+ block regardless of
 * contractual capacity — see `canPurchaseRestricted`.
 *
 * ── SA-ID parsing ────────────────────────────────────────────────────────────
 * This file ports a minimal SA-ID → DOB extraction locally because product-tribe
 * does not yet depend on @wrdo/connect. When tribe adopts that package (likely
 * alongside PayShap), replace `parseSaIdDob` with `validateSaId(id).parsed?.dob`
 * from @wrdo/connect — the behaviour (incl. the >=25 century cutoff) is mirrored
 * intentionally so the swap is lossless.
 */

export type AgeBand = 'child' | 'minor' | 'adult';

const SA_ID_RE = /^\d{13}$/;
const ISO_DOB_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Accepts DD/MM/YYYY or DD-MM-YYYY (the order South Africans type birthdays).
const TYPED_DOB_RE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/;

/** Standard Luhn mod-10 over an SA ID's first 12 digits, checked against the 13th. */
function luhnCheck(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    let d = Number(digits[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[12]);
}

/** True only for a real calendar date (rejects 2026-02-30, month 13, etc.). */
function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
}

/**
 * Extract a canonical "YYYY-MM-DD" DOB from a 13-digit SA ID number.
 * Returns null if the input is not a structurally valid, Luhn-passing SA ID.
 *
 * TODO(connect): replace with @wrdo/connect's validateSaId(id).parsed?.dob once
 * product-tribe depends on @wrdo/connect. Logic mirrored from that util.
 */
export function parseSaIdDob(id: string): string | null {
  const trimmed = id.trim();
  if (!SA_ID_RE.test(trimmed)) return null;

  const yy = Number(trimmed.slice(0, 2));
  const mm = Number(trimmed.slice(2, 4));
  const dd = Number(trimmed.slice(4, 6));

  // SA century convention: >= 25 → 19xx, < 25 → 20xx.
  const year = yy >= 25 ? 1900 + yy : 2000 + yy;
  if (!isRealDate(year, mm, dd)) return null;

  const citizenDigit = Number(trimmed[10]);
  if (citizenDigit !== 0 && citizenDigit !== 1) return null;

  if (!luhnCheck(trimmed)) return null;

  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * Parse a typed birthday into canonical "YYYY-MM-DD".
 * Accepts DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, or already-canonical YYYY-MM-DD.
 * Returns null on anything that isn't a real calendar date.
 */
export function parseTypedDob(input: string): string | null {
  const trimmed = input.trim();

  const iso = ISO_DOB_RE.exec(trimmed);
  if (iso) {
    const [, y, m, d] = iso;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    return isRealDate(year, month, day)
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : null;
  }

  const typed = TYPED_DOB_RE.exec(trimmed);
  if (typed) {
    const [, d, m, y] = typed;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    return isRealDate(year, month, day)
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : null;
  }

  return null;
}

/**
 * Resolve a DOB from a single user message that may be either a typed birthday
 * or an SA ID number. SA ID is tried first (13 pure digits is unambiguous), then
 * a typed date. Returns canonical "YYYY-MM-DD" or null if neither parses.
 *
 * Note: the SA ID number itself is never returned or stored — only the DOB is
 * extracted. POPIA: we keep what we need (the birthday), discard the rest.
 */
export function resolveDob(input: string): string | null {
  return parseSaIdDob(input) ?? parseTypedDob(input);
}

/**
 * Whole years between `dob` and `today` (default: now, UTC).
 * `dob` must be canonical "YYYY-MM-DD".
 */
export function computeAge(dob: string, today: Date = new Date()): number {
  const iso = ISO_DOB_RE.exec(dob);
  if (!iso) throw new Error(`computeAge: dob must be YYYY-MM-DD, got "${dob}"`);
  const birthYear = Number(iso[1]);
  const birthMonth = Number(iso[2]);
  const birthDay = Number(iso[3]);

  let age = today.getUTCFullYear() - birthYear;
  const beforeBirthdayThisYear =
    today.getUTCMonth() + 1 < birthMonth ||
    (today.getUTCMonth() + 1 === birthMonth && today.getUTCDate() < birthDay);
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

/** child = under 7, minor = 7–17, adult = 18+. */
export function ageBand(dob: string, today: Date = new Date()): AgeBand {
  const age = computeAge(dob, today);
  if (age < 7) return 'child';
  if (age < 18) return 'minor';
  return 'adult';
}

/** Hard 18+ gate for statutorily age-restricted goods (alcohol, tobacco). */
export function canPurchaseRestricted(dob: string, today: Date = new Date()): boolean {
  return computeAge(dob, today) >= 18;
}

/** True when today's month+day matches the DOB's (year-agnostic). */
export function isBirthdayToday(dob: string, today: Date = new Date()): boolean {
  const iso = ISO_DOB_RE.exec(dob);
  if (!iso) return false;
  const birthMonth = Number(iso[2]);
  const birthDay = Number(iso[3]);
  return today.getUTCMonth() + 1 === birthMonth && today.getUTCDate() === birthDay;
}
