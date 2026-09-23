import type { Request } from "express";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { isUuid } from "../../lib/ids";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

function bearerToken(request: Request): string | null {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

/**
 * The account a request's access token belongs to, if it is a live one.
 *
 * getClaims checks the signature here, against the project's published keys,
 * when the project signs tokens with asymmetric keys, and only asks the auth
 * server when it still uses a shared secret. getUser asked the auth server on
 * every request, before any of the request's own work began.
 */
async function authenticatedUserId(request: Request): Promise<string | null> {
  if (!supabaseAdmin) return null;

  const token = bearerToken(request);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getClaims(token);

  if (error) {
    // A bad, expired or signed-out token simply means not signed in. The auth
    // server being down or unreachable is not that: answering "sign in again"
    // would send a student who is signed in round in a loop, so it is reported
    // as the failure it is.
    if (isAuthRetryableFetchError(error)) {
      throw new Error(`Could not check your sign-in just now. Try again in a moment. (${error.message})`);
    }
    return null;
  }

  const userId = data?.claims.sub;
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

/**
 * Whether a key is a guest's rather than an account's.
 *
 * Account ids are uuids, so any other key can only be a guest's. It is also
 * one the profiles lookup cannot be asked about: the id column is a uuid, and
 * Postgres rejects a malformed value there outright instead of finding nothing.
 */
async function isGuestKey(studentKey: string): Promise<boolean> {
  if (!supabaseAdmin || !isUuid(studentKey)) return true;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", studentKey)
    .maybeSingle();

  if (error) throw new Error(`Failed to verify student account: ${error.message}`);

  // No account owns this key, so it is a guest credential.
  return data === null;
}

/**
 * Guests use their random browser key as a credential. Account ids are not
 * credentials, so once a key belongs to a profile it must be backed by that
 * account's Supabase access token.
 */
export async function canUseStudentKey(request: Request, studentKey: string): Promise<boolean> {
  if (!supabaseAdmin) return true;

  if ((await authenticatedUserId(request)) === studentKey) return true;

  return isGuestKey(studentKey);
}

/** Claiming guest history always targets a real signed-in account. */
export async function isAuthenticatedStudent(request: Request, studentKey: string): Promise<boolean> {
  if (!supabaseAdmin) return true;
  return (await authenticatedUserId(request)) === studentKey;
}

/**
 * Whether history may be moved off `guestKey` onto `studentKey`.
 *
 * Quoting a guest key is what proves those tests are the caller's, and that
 * only holds while it really is a guest key. An account's id is no secret, so
 * without this anyone signed in could name another student's account as the
 * "guest" and take their whole history.
 */
export async function canClaimFrom(guestKey: string, studentKey: string): Promise<boolean> {
  if (guestKey === studentKey) return true;
  return isGuestKey(guestKey);
}
