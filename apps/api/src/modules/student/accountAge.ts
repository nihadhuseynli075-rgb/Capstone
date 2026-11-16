import { supabaseAdmin } from "../../lib/supabaseAdmin";
import type { SignedInAccount } from "./studentAuth";

/**
 * The year of birth an account has given, and when it gave it.
 *
 * Accounts are for students of MIN_ACCOUNT_AGE and over (packages/shared), and
 * an account has to give the year it was born before the API lets it do
 * anything else: a younger student has no account at all and practises as a
 * guest. Only the year is kept, never the date.
 *
 * Both are kept in the account's app_metadata. Only the secret key can write
 * that, so, unlike user metadata, a student cannot set it for themselves
 * through Supabase; and it needs no table, so there is no migration to run
 * before this works. Every access token carries a copy, so the check usually
 * costs nothing.
 */
export interface RecordedAge {
  birthYear: number;
  /** When the student gave it, as an ISO time. */
  confirmedAt: string;
}

/** The recorded age in an account's app_metadata, or null when it has none. */
export function ageFromAppMetadata(appMetadata: unknown): RecordedAge | null {
  if (typeof appMetadata !== "object" || appMetadata === null) return null;

  const { birth_year: birthYear, age_confirmed_at: confirmedAt } = appMetadata as Record<string, unknown>;
  if (typeof birthYear !== "number" || !Number.isInteger(birthYear)) return null;
  if (typeof confirmedAt !== "string" || Number.isNaN(Date.parse(confirmedAt))) return null;

  return { birthYear, confirmedAt };
}

/** The answer to an account that has not given its year yet. The web app branches on the code and asks for it. */
export const ageRequired = {
  code: "age-required",
  message: "Tell us the year you were born before using your account."
} as const;

/**
 * Thrown where an account's own tests are asked for before it has given its
 * year (see isAuthenticatedStudent). The API answers it with a 403 and
 * ageRequired, rather than the "sign in again" a wrong token gets.
 */
export class AgeRequiredError extends Error {
  constructor() {
    super(ageRequired.message);
    this.name = "AgeRequiredError";
  }
}

/**
 * Accounts seen to have given their year since this process started.
 *
 * A token issued before the year was given carries no copy of it until the
 * browser refreshes its session. The web app does that straight away, but a
 * request can arrive before it has, so the auth server is asked once and the
 * answer kept here. A year once given is never taken back, so the verdict
 * cannot go stale; a deleted account is forgotten. Capped so that it cannot
 * grow without end.
 */
const recordedIds = new Set<string>();
const RECORDED_IDS_MAX = 10_000;

function rememberRecordedAge(id: string): void {
  if (recordedIds.size >= RECORDED_IDS_MAX) recordedIds.clear();
  recordedIds.add(id);
}

/** For an account that has just been deleted. */
export function forgetRecordedAge(id: string): void {
  recordedIds.delete(id);
}

/** Whether the account has given its year of birth: the token's copy first, then this process's memory, then the auth server. */
export async function hasRecordedAge(account: SignedInAccount): Promise<boolean> {
  // Without Supabase there are no accounts, and so nothing to ask.
  if (!supabaseAdmin) return true;
  if (account.age || recordedIds.has(account.id)) return true;

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(account.id);

  if (error) {
    if (error.status === 404) return false;
    throw new Error(`Failed to check the account's year of birth: ${error.message}`);
  }

  if (!ageFromAppMetadata(data.user?.app_metadata)) return false;

  rememberRecordedAge(account.id);
  return true;
}

/**
 * Writes the year and the time it was given into the account's app_metadata.
 *
 * Supabase merges app_metadata rather than replacing it, so the provider list
 * it keeps there itself is left as it was.
 */
export async function recordAge(id: string, birthYear: number, now: Date = new Date()): Promise<RecordedAge> {
  if (!supabaseAdmin) throw new Error("Accounts need the API connected to Supabase.");

  const confirmedAt = now.toISOString();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
    app_metadata: { birth_year: birthYear, age_confirmed_at: confirmedAt }
  });

  if (error) throw new Error(`Failed to record the year of birth: ${error.message}`);

  rememberRecordedAge(id);
  return { birthYear, confirmedAt };
}

/**
 * The year given on the sign-up form, which travels in the account's user
 * metadata until the API records it.
 *
 * User metadata is whatever the sign-up request carried, and the account
 * holder can change it, so this is input: the caller checks it like a year
 * typed in (birthYearProblem) before recording it.
 *
 * Not once Google has signed in to the account. Anybody can sign up with a
 * classmate's address, and when its owner then presses "Continue with
 * Google", Supabase hands them that same account, metadata and all (see the
 * README on email confirmation). The year in it is the stranger's, so the
 * owner is asked for their own.
 */
export function signUpBirthYear(account: SignedInAccount): number | null {
  if (account.providers.includes("google")) return null;

  const value = account.metadata.birth_year;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d{4}$/.test(value.trim())) return Number(value.trim());
  return null;
}
