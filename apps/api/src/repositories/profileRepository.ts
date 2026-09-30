import type { SupabaseClient } from "@supabase/supabase-js";
import { profileLimits, type StudentProfile } from "@grade9/shared";
import { isUuid } from "../lib/ids";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import type { SignedInAccount } from "../modules/student/studentAuth";

/**
 * The account a student key belongs to, or null when it is a guest's key.
 *
 * Account ids are uuids, so any other key can only be a guest's. It is also
 * one the lookup cannot be asked about: the id column is a uuid, and Postgres
 * rejects a malformed value there outright instead of finding nothing. Without
 * Supabase there are no accounts at all.
 *
 * Throws when the lookup itself fails; each caller decides whether that should
 * stop the request.
 */
export async function accountIdFor(studentKey: string): Promise<string | null> {
  if (!supabaseAdmin || !isUuid(studentKey)) return null;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", studentKey)
    .maybeSingle();

  if (error) throw new Error(`Failed to verify student account: ${error.message}`);

  return data ? (data.id as string) : null;
}

// ---------------------------------------------------------------------------
// The profile page
// ---------------------------------------------------------------------------
// Profiles only exist with Supabase: without it there are no accounts, so
// there is no in-memory version of anything below. The profile routes refuse
// before reaching here when Supabase is not configured.

const PROFILE_COLUMNS = "id, full_name, email, avatar_url, created_at";

function client(): SupabaseClient {
  if (!supabaseAdmin) throw new Error("Profiles need the API connected to Supabase.");
  return supabaseAdmin;
}

/**
 * A profile query's failure, worded for whoever has to fix it.
 *
 * The one to expect is migration 0007 not having been run yet, which makes
 * Postgres refuse the `avatar_url` column. Naming the file that fixes it is
 * worth more than the raw message on its own.
 */
function profileError(action: string, error: { code?: string; message: string }): Error {
  const missingColumn = error.code === "42703" || error.code === "PGRST204";
  const hint = missingColumn
    ? " Run supabase/migrations/0007_profiles_and_google.sql in the Supabase SQL editor."
    : "";
  return new Error(`Failed to ${action}: ${error.message}.${hint}`);
}

function toProfile(row: Record<string, unknown>): StudentProfile {
  const email = typeof row.email === "string" ? row.email : "";
  const name = typeof row.full_name === "string" ? row.full_name.trim() : "";

  return {
    id: row.id as string,
    fullName: name.length > 0 ? name : email.split("@")[0],
    email,
    avatarUrl: typeof row.avatar_url === "string" && row.avatar_url.length > 0 ? row.avatar_url : null,
    createdAt: row.created_at as string
  };
}

function metadataText(account: SignedInAccount, key: string): string {
  const value = account.metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A name from sign-up, held to the same shape as one typed on the profile page.
 *
 * The metadata is whatever the sign-up request carried, and a request does not
 * have to come from this app: without this, a name of any length, with any
 * layout in it, would reach the profile and later the leaderboard.
 */
function boundedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, profileLimits.nameMax);
}

/**
 * The Google photo an account signed up with, if that is really what it is.
 *
 * `avatar_url` sits in user metadata, which the account holder can write to
 * directly through Supabase, so it is not by itself evidence of anything. A
 * photo is only taken from it when Supabase says the account is Google's and
 * the address is one of Google's own: anything else would let somebody point
 * their picture at an address of their choosing, which every browser that
 * later shows them would then go and fetch.
 */
function googlePhotoUrl(account: SignedInAccount): string | null {
  if (account.provider !== "google") return null;

  const candidate = metadataText(account, "avatar_url") || metadataText(account, "picture");
  if (candidate.length === 0) return null;

  try {
    const address = new URL(candidate);
    const googleHosted =
      address.hostname === "googleusercontent.com" || address.hostname.endsWith(".googleusercontent.com");

    return address.protocol === "https:" && googleHosted ? candidate : null;
  } catch {
    return null;
  }
}

export async function findProfile(id: string): Promise<StudentProfile | null> {
  const { data, error } = await client()
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw profileError("load your profile", error);
  return data ? toProfile(data) : null;
}

/**
 * The account's profile, made now if it has none.
 *
 * The sign-up trigger makes one for every account, so this only does anything
 * for an account that signed up before the trigger was in the project. Its
 * name and photo are worked out the way the trigger in 0007 would have.
 *
 * Null when the account itself no longer exists: deleted while a token for it
 * was still live.
 */
export async function ensureProfile(account: SignedInAccount): Promise<StudentProfile | null> {
  const existing = await findProfile(account.id);
  if (existing) return existing;

  const { data, error } = await client()
    .from("profiles")
    .insert({
      id: account.id,
      full_name: boundedName(
        metadataText(account, "full_name") || metadataText(account, "name") || account.email.split("@")[0]
      ),
      email: account.email || null,
      avatar_url: googlePhotoUrl(account)
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (!error) return toProfile(data);

  // Two requests found no profile at once, and the other one made it.
  if (error.code === "23505") return findProfile(account.id);

  // The profile's id points at the account, so a deleted account cannot have one.
  if (error.code === "23503") return null;

  throw profileError("create your profile", error);
}

async function updateProfile(
  id: string,
  changes: Record<string, unknown>,
  action: string
): Promise<StudentProfile | null> {
  const { data, error } = await client()
    .from("profiles")
    .update(changes)
    .eq("id", id)
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (error) throw profileError(action, error);
  return data ? toProfile(data) : null;
}

export function updateProfileName(id: string, fullName: string): Promise<StudentProfile | null> {
  return updateProfile(id, { full_name: fullName }, "save your name");
}

/** Points the profile at a photo, or at none with null. */
export function setProfilePhoto(id: string, avatarUrl: string | null): Promise<StudentProfile | null> {
  return updateProfile(id, { avatar_url: avatarUrl }, "save your photo");
}

/**
 * Copies a new name onto the Supabase account as well.
 *
 * The profile is the record, but the account's copy is what the browser has
 * to hand before the profile loads, and what the Supabase dashboard lists.
 * Failing here leaves only that copy behind, so it is logged rather than
 * allowed to fail a rename that has already been saved.
 */
export async function mirrorNameToAccount(id: string, fullName: string): Promise<void> {
  const { error } = await client().auth.admin.updateUserById(id, {
    user_metadata: { full_name: fullName }
  });

  if (error) console.error(`[api] Could not copy the new name onto account ${id}: ${error.message}`);
}

/**
 * Deletes the account itself.
 *
 * Postgres takes everything hanging off it along with it: the profile, and
 * through the profile every attempt linked to it, daily quiz attempts and
 * friendships.
 *
 * An account that is already gone counts as deleted, so a second press of the
 * button, arriving after the first has finished, is not reported as a failure.
 */
export async function deleteAccount(id: string): Promise<void> {
  const { error } = await client().auth.admin.deleteUser(id);
  if (error && error.status !== 404) throw new Error(`Failed to delete the account: ${error.message}`);
}
