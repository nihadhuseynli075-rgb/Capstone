/**
 * Client-side checks for the auth forms.
 *
 * These exist to give an answer immediately rather than after a round trip.
 * Supabase re-checks everything server-side, so this is convenience, never the
 * actual guard.
 */

import { profileLimits } from "@grade9/shared";

export const MIN_PASSWORD_LENGTH = 8;

/*
 * Each rule is written once, as a problem name, and the English sentence for
 * the sign-in and sign-up pages is picked by that name below. The profile page
 * picks its sentence in the student's own language by the same name, so the
 * two cannot disagree about what counts as a problem.
 */

export type NameProblem = "empty" | "too-short" | "too-long";
export type EmailProblem = "empty" | "invalid";
export type PasswordProblem = "empty" | "too-short" | "needs-letter-and-number";

/** The same limits the API holds a new name to, so the two cannot disagree. */
export function nameProblem(value: string): NameProblem | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return "empty";
  if (trimmed.length < profileLimits.nameMin) return "too-short";
  if (trimmed.length > profileLimits.nameMax) return "too-long";
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

export function validateName(value: string): string | null {
  const problem = nameProblem(value);
  if (problem === "empty") return "Enter your name.";
  if (problem === "too-short") return "That name is too short.";
  if (problem === "too-long") return "That name is too long.";
  return null;
}

export function validateEmail(value: string): string | null {
  const problem = emailProblem(value);
  if (problem === "empty") return "Enter your email address.";
  if (problem === "invalid") return "That does not look like an email address.";
  return null;
}

export function validatePassword(value: string): string | null {
  const problem = passwordProblem(value);
  if (problem === "empty") return "Enter a password.";
  if (problem === "too-short") return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (problem === "needs-letter-and-number") return "Include at least one letter and one number.";
  return null;
}

export type PasswordStrength = "weak" | "fair" | "strong";

/**
 * A rough strength read for the meter on the register form.
 *
 * Length carries most of the weight because it genuinely matters most; the
 * character classes are a nudge, not a rule.
 */
export function passwordStrength(value: string): { level: PasswordStrength; label: string; percent: number } {
  if (value.length === 0) return { level: "weak", label: "", percent: 0 };

  let score = 0;
  if (value.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^a-zA-Z0-9]/.test(value)) score += 1;

  if (score <= 2) return { level: "weak", label: "Weak", percent: 33 };
  if (score <= 3) return { level: "fair", label: "Fair", percent: 66 };
  return { level: "strong", label: "Strong", percent: 100 };
}
