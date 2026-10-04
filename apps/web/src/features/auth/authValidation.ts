/**
 * Client-side checks for the auth forms.
 *
 * These exist to give an answer immediately rather than after a round trip.
 * Supabase re-checks everything server-side, so this is convenience, never the
 * actual guard.
 */

import { cleanName, isReadableName, profileLimits } from "@grade9/shared";

export const MIN_PASSWORD_LENGTH = 8;

/*
 * Each rule is written once, as a problem name. The sign-in, sign-up and
 * profile pages all pick their sentence for it, in the student's own language,
 * by that name (see profileText), so they cannot disagree about what counts as
 * a problem.
 */

export type NameProblem = "empty" | "too-short" | "too-long";
export type EmailProblem = "empty" | "invalid";
export type PasswordProblem = "empty" | "too-short" | "needs-letter-and-number";

/**
 * The same limits the API holds a new name to, so the two cannot disagree. A
 * name with nothing readable in it, such as three zero-width spaces, is as
 * good as an empty one.
 */
export function nameProblem(value: string): NameProblem | null {
  const cleaned = cleanName(value);
  if (!isReadableName(cleaned)) return "empty";
  if (cleaned.length < profileLimits.nameMin) return "too-short";
  if (cleaned.length > profileLimits.nameMax) return "too-long";
  return null;
}

export function emailProblem(value: string): EmailProblem | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "empty";
  // Deliberately loose: the only real test of an address is sending to it.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "invalid";
  return null;
}

export function passwordProblem(value: string): PasswordProblem | null {
  if (value.length === 0) return "empty";
  if (value.length < MIN_PASSWORD_LENGTH) return "too-short";
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) return "needs-letter-and-number";
  return null;
}

export type PasswordStrength = "weak" | "fair" | "strong";

/**
 * A rough strength read for the meter on the register form. The word under the
 * meter is the page's to choose, in the site language (see authText).
 *
 * Length carries most of the weight because it genuinely matters most; the
 * character classes are a nudge, not a rule.
 */
export function passwordStrength(value: string): { level: PasswordStrength; percent: number } {
  if (value.length === 0) return { level: "weak", percent: 0 };

  let score = 0;
  if (value.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^a-zA-Z0-9]/.test(value)) score += 1;

  if (score <= 2) return { level: "weak", percent: 33 };
  if (score <= 3) return { level: "fair", percent: 66 };
  return { level: "strong", percent: 100 };
}
