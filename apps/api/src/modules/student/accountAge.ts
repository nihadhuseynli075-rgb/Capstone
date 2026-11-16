import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../../lib/env";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import type { SignedInAccount } from "./studentAuth";

/**
 * The age check for new accounts.
 *
 * Accounts are for students of MIN_ACCOUNT_AGE and over (packages/shared). A
 * new account gives the year it was born before the API lets it do anything
 * else: an email sign-up on the form, a Google sign-up at its first sign-in. A
 * student too young for an account is not given one and practises as a guest.
 * Only the year is kept, never the date.
 *
 * Accounts made before the check began are left exactly as they are: not
 * asked, not locked, not deleted. When it began is the moment migration 0019
 * first ran (`age_checks.checks_from`); before that, nobody is asked. An
 * account's own `created_at`, from the auth server, says which side it is on.
 *
 * A new account's one answer is kept in `age_decisions`, whose primary key
 * makes the first answer final (see decideAge), and copied into the account's
 * app_metadata. Only the secret key can write either, so a student cannot set
 * them through Supabase, and every access token carries the copy, so the
 * check usually costs nothing.
 */
export interface RecordedAge {
  birthYear: number;
  /** When the student gave it, as an ISO time. */
  confirmedAt: string;
}

/**
 * Where an account stands with the check.
 *
 * - exempt: made before the check began, or the check is not on yet. Left as it is.
 * - confirmed: a new account that has given a year old enough for an account.
 * - pending: a new account that has not answered yet. The API uses nothing of it.
 */
export type AgeStatus = "exempt" | "confirmed" | "pending";

/** The recorded age in an account's app_metadata, or null when it has none. */
export function ageFromAppMetadata(appMetadata: unknown): RecordedAge | null {
  if (typeof appMetadata !== "object" || appMetadata === null) return null;

  const { birth_year: birthYear, age_confirmed_at: confirmedAt } = appMetadata as Record<string, unknown>;
  if (typeof birthYear !== "number" || !Number.isInteger(birthYear)) return null;
  if (typeof confirmedAt !== "string" || Number.isNaN(Date.parse(confirmedAt))) return null;

  return { birthYear, confirmedAt };
}

/** The answer to a new account that has not given its year yet. The web app branches on the code and asks for it. */
export const ageRequired = {
  code: "age-required",
  message: "Tell us the year you were born before using your account."
} as const;

/**
 * Thrown where a pending account's own tests are asked for (see
 * isAuthenticatedStudent). The API answers it with a 403 and ageRequired,
 * rather than the "sign in again" a wrong token gets.
 */
export class AgeRequiredError extends Error {
  constructor() {
    super(ageRequired.message);
    this.name = "AgeRequiredError";
  }
}

function client(): SupabaseClient {
  if (!supabaseAdmin) throw new Error("Accounts need the API connected to Supabase.");
  return supabaseAdmin;
}

/** A table that is not there yet: 0019 has not been run. */
function isMissingTable(error: { code?: string }): boolean {
  return error.code === "PGRST205" || error.code === "42P01";
}

// ---------------------------------------------------------------------------
// When the check began
// ---------------------------------------------------------------------------

let since: { at: number | null; readAt: number } | null = null;

/**
 * When the check began, as a time in milliseconds, or null while it is not on.
 *
 * Read once and kept: the moment never moves once 0019 has run. While it has
 * not, the table is asked again now and then (AGE_CHECK_RECHECK_MS), so the
 * check starts without a restart once the migration is run.
 */
export async function ageCheckSince(): Promise<number | null> {
  if (!supabaseAdmin) return null;
  if (since && (since.at !== null || Date.now() - since.readAt < env.ageCheckRecheckMs)) return since.at;

  const { data, error } = await supabaseAdmin.from("age_checks").select("checks_from").limit(1).maybeSingle();
  if (error && !isMissingTable(error)) throw new Error(`Failed to read when the age check began: ${error.message}`);

  const at = !error && typeof data?.checks_from === "string" ? Date.parse(data.checks_from) : Number.NaN;
  since = { at: Number.isNaN(at) ? null : at, readAt: Date.now() };
  return since.at;
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

/**
 * Accounts whose status is settled for good: exempt never changes, and a
 * confirmed year is final. A pending one is not kept, since it is about to
 * change. Capped so it cannot grow without end; a deleted account is forgotten.
 */
const settled = new Map<string, "exempt" | "confirmed">();
const SETTLED_MAX = 10_000;

function remember(id: string, status: "exempt" | "confirmed"): AgeStatus {
  if (settled.size >= SETTLED_MAX) settled.clear();
  settled.set(id, status);
  return status;
}

/** For an account that has just been deleted. */
export function forgetAccount(id: string): void {
  settled.delete(id);
}

/** Where the account behind a request stands: its token's copy first, then the auth server (see ageStatusById). */
export async function ageStatusOf(account: SignedInAccount): Promise<AgeStatus> {
  if (!supabaseAdmin) return "exempt";
  if (account.age) return "confirmed";
  return ageStatusById(account.id);
}

/** Where an account stands, by its id. */
export async function ageStatusById(id: string): Promise<AgeStatus> {
  // Without Supabase there are no accounts, and so nothing to ask.
  if (!supabaseAdmin) return "exempt";

  const known = settled.get(id);
  if (known) return known;

  // Not on yet: nobody is asked. Not remembered, since it may start any moment.
  const from = await ageCheckSince();
  if (from === null) return "exempt";

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);

  if (error) {
    // An account that is gone is nobody's to check; whatever asked will find
    // it gone in its own way, as before this check existed.
    if (error.status === 404) return "exempt";
    throw new Error(`Failed to check the account's year of birth: ${error.message}`);
  }

  // Made before the check began, or of no known age: left as it is.
  const made = Date.parse(data.user?.created_at ?? "");
  if (Number.isNaN(made) || made < from) return remember(id, "exempt");

  if (ageFromAppMetadata(data.user?.app_metadata)) return remember(id, "confirmed");

  // The answer is in, but its copy in app_metadata is not: a request that
  // stopped halfway. It is put there now.
  const decision = await decisionFor(id);
  if (decision?.outcome === "confirmed") {
    await recordAge(id, decision.birthYear, decision.decidedAt);
    return "confirmed";
  }

  return "pending";
}

/**
 * Which of these people are pending, for the friends lists to leave out.
 *
 * `createdAt` is when each one's profile was made. A profile is made when its
 * account is or later, never before, so one older than the check belongs to
 * an account older than it, and only the others are asked about.
 */
export async function pendingAmong(people: Array<{ id: string; createdAt: string | null }>): Promise<Set<string>> {
  const pending = new Set<string>();
  if (!supabaseAdmin || people.length === 0) return pending;

  const from = await ageCheckSince();
  if (from === null) return pending;

  const toAsk = people.filter((person) => {
    if (settled.has(person.id)) return false;
    const made = Date.parse(person.createdAt ?? "");
    return Number.isNaN(made) || made >= from;
  });

  const statuses = await Promise.all(toAsk.map((person) => ageStatusById(person.id)));
  toAsk.forEach((person, index) => {
    if (statuses[index] === "pending") pending.add(person.id);
  });
  return pending;
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

/** A new account's answer: the year, and whether it was kept or refused. */
export interface AgeDecision {
  birthYear: number;
  outcome: "confirmed" | "refused";
  decidedAt: string;
}

function toDecision(row: Record<string, unknown>): AgeDecision {
  return {
    birthYear: Number(row.birth_year),
    outcome: row.outcome === "refused" ? "refused" : "confirmed",
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : new Date().toISOString()
  };
}

async function decisionFor(id: string): Promise<AgeDecision | null> {
  const { data, error } = await client()
    .from("age_decisions")
    .select("birth_year, outcome, decided_at")
    .eq("account_id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(`Failed to read the year of birth: ${error.message}`);
  }

  return data ? toDecision(data) : null;
}

/**
 * Makes the account's one decision, or returns the one already made.
 *
 * The row's primary key is the account id, so of two answers sent at once
 * (two tabs, a double click, a retry) the first insert wins and the other is
 * refused by the database. That one then reads the winner and follows it, so
 * a second request never records a year over the first, nor deletes an
 * account the first has kept. It holds across any number of API processes.
 *
 * An account deleted meanwhile has no row left to read (its row goes with it),
 * and is answered as refused, which is what deleted it.
 */
export async function decideAge(id: string, birthYear: number, outcome: "confirmed" | "refused"): Promise<AgeDecision> {
  const { data, error } = await client()
    .from("age_decisions")
    .insert({ account_id: id, birth_year: birthYear, outcome })
    .select("birth_year, outcome, decided_at")
    .single();

  if (!error) return toDecision(data);

  // The account itself is gone, so there was nothing to record against.
  if (error.code === "23503") return { birthYear, outcome: "refused", decidedAt: new Date().toISOString() };
  if (error.code !== "23505") throw new Error(`Failed to record the year of birth: ${error.message}`);

  return (await decisionFor(id)) ?? { birthYear, outcome: "refused", decidedAt: new Date().toISOString() };
}

/**
 * Copies a confirmed year, and when it was given, into the account's
 * app_metadata, where every access token carries it. Supabase merges
 * app_metadata rather than replacing it, so its own provider list stays.
 */
export async function recordAge(id: string, birthYear: number, confirmedAt: string): Promise<void> {
  const { error } = await client().auth.admin.updateUserById(id, {
    app_metadata: { birth_year: birthYear, age_confirmed_at: confirmedAt }
  });

  if (error) throw new Error(`Failed to record the year of birth: ${error.message}`);
  remember(id, "confirmed");
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
