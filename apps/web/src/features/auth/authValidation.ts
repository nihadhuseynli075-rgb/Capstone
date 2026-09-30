/**
 * Client-side checks for the auth forms.
 *
 * These exist to give an answer immediately rather than after a round trip.
 * Supabase re-checks everything server-side, so this is convenience, never the
 * actual guard.
 */

import { profileLimits } from "@grade9/shared";

export const MIN_PASSWORD_LENGTH = 8;

/** The same limits the API holds a new name to, so the two cannot disagree. */
export function validateName(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return "Enter your name.";
  if (trimmed.length < profileLimits.nameMin) return "That name is too short.";
  if (trimmed.length > profileLimits.nameMax) return "That name is too long.";
  return null;
}

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Enter your email address.";
  // Deliberately loose: the only real test of an address is sending to it.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "That does not look like an email address.";
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length === 0) return "Enter a password.";
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return "Include at least one letter and one number.";
  }
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
