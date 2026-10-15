import type { Request } from "express";
import { isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { bearerToken } from "../../lib/bearerToken";
import { isUuid } from "../../lib/ids";
import { PublicError } from "../../lib/publicError";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { accountIdFor } from "../../repositories/profileRepository";

/** A signed-in student, as their access token describes them. */
export interface SignedInAccount {
  id: string;
  /** Empty only for an account made without one, which this app never does. */
  email: string;
  /**
   * How the account was first made: "email" or "google". Supabase sets this
   * itself, so unlike `metadata` it can be trusted.
   */
  provider: string | null;
  /**
   * The account's own name and photo, as its token carries them.
   *
   * Written by the sign-up request, and by every Google sign-in after it, and
   * changeable by the account holder at any time through Supabase. So it is
   * input: checked before it is used, never trusted as a fact.
   */
  metadata: Record<string, unknown>;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Whether a token can be read at all: three parts of base64url, the first two
 * of them JSON objects in UTF-8, as every token Supabase issues is. It says
 * nothing about whether the token is genuine; getClaims decides that.
 */
export function isReadableToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return false;

  try {
    return parts.slice(0, 2).every((part) => {
      const decoded: unknown = JSON.parse(utf8.decode(Buffer.from(part, "base64url")));
      return typeof decoded === "object" && decoded !== null && !Array.isArray(decoded);
    });
  } catch {
    return false;
  }
}

/**
 * The account a request's access token belongs to, if it is a live one.
 *
 * getClaims checks the signature here, against the project's published keys,
 * when the project signs tokens with asymmetric keys, and only asks the auth
 * server when it still uses a shared secret. getUser asked the auth server on
 * every request, before any of the request's own work began.
 */
export async function signedInAccount(request: Request): Promise<SignedInAccount | null> {
  if (!supabaseAdmin) return null;

  const token = bearerToken(request);
  if (!token) return null;

  let checked: Awaited<ReturnType<SupabaseClient["auth"]["getClaims"]>>;

  try {
    checked = await supabaseAdmin.auth.getClaims(token);
  } catch (thrown) {
    // getClaims returns what is wrong with a token as `error`, below, except
    // when it cannot decode the token at all, and then it throws: "abc.def.ghi"
    // is three parts of base64url whose bytes are not UTF-8 text. Nobody
    // issued that, so it means signed out, as an expired token does; answered
    // as a 500, every made-up header left a stack trace in the log. A throw
    // over a token that does decode is passed on. Every token Supabase issues
    // decodes, so that is this end failing (an algorithm this version of the
    // library does not know, say), and "sign in again" would only send every
    // student round in a loop. A failed request to the auth server is passed
    // on too, should a later version throw one; today it comes back as
    // `error`, below.
    if (isReadableToken(token) || isAuthRetryableFetchError(thrown)) throw thrown;
    return null;
  }

  const { data, error } = checked;

  if (error) {
    // A bad, expired or signed-out token simply means not signed in. The auth
    // server being down or unreachable is not that: answering "sign in again"
    // would send a student who is signed in round in a loop, so it is reported
    // as the failure it is.
    if (isAuthRetryableFetchError(error)) {
      throw new PublicError("Could not check your sign-in just now. Try again in a moment.", error.message);
    }
    return null;
  }

  const claims = data?.claims;
  if (!claims || typeof claims.sub !== "string" || claims.sub.length === 0) return null;

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    provider: typeof claims.app_metadata?.provider === "string" ? claims.app_metadata.provider : null,
    metadata: claims.user_metadata ?? {}
  };
}

/**
 * The account behind the request's token, as the auth server sees it right
 * now. Null when the session has ended.
 *
 * `signedInAccount` checks the token's signature, which a project signing with
 * asymmetric keys does without asking anyone: a token from a session that has
 * since been signed out still passes, until it expires about an hour later.
 * This asks the auth server, which knows. It costs a round trip, so it is for
 * the few things that cannot be undone rather than for every request.
 *
 * Asking the server also gives the account's current email. The one inside a
 * token is only as new as the token, so after a student changes their address
 * it keeps naming the old one for up to an hour.
 */
export async function liveAccount(request: Request): Promise<SignedInAccount | null> {
  if (!supabaseAdmin) return null;

  const token = bearerToken(request);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error) {
    // As above: unreachable is not the same as signed out.
    if (isAuthRetryableFetchError(error)) {
      throw new PublicError("Could not check your sign-in just now. Try again in a moment.", error.message);
    }
    return null;
  }

  const user = data.user;
  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    provider: typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : null,
    metadata: user.user_metadata ?? {}
  };
}

/**
 * Keys already shown to be nobody's account, so the auth server is asked
 * about each at most once per process. A random guest key never turns into an
 * account id later, so a verdict here cannot go stale. Capped so a stream of
 * made-up keys cannot grow it without end.
 */
const knownGuestKeys = new Set<string>();
const KNOWN_GUEST_KEYS_MAX = 10_000;

/**
 * Whether an account exists with this id, asked of the auth server itself.
 *
 * Throws when the auth server cannot answer, as accountIdFor does when the
 * profiles lookup fails: guessing "guest" would hand out an account's tests.
 */
async function isAuthUser(studentKey: string): Promise<boolean> {
  if (!supabaseAdmin || !isUuid(studentKey)) return false;

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(studentKey);
  if (error) {
    if (error.status === 404) return false;
    throw new Error(`Failed to verify student account: ${error.message}`);
  }
  return Boolean(data.user);
}

/**
 * Whether a key is a guest's: one no account owns.
 *
 * A profile row is the quick answer, but not a complete one: an account that
 * signed up before the profile trigger existed has none until it opens its
 * profile page (see ensureProfile). Its id then passed as a guest key, so
 * anyone who knew it could read that account's history with no token and claim
 * it onto their own account. A uuid with no profile is checked against the
 * auth server before it is treated as a guest's.
 */
async function isGuestKey(studentKey: string): Promise<boolean> {
  if (knownGuestKeys.has(studentKey)) return true;
  if ((await accountIdFor(studentKey)) !== null) return false;
  if (await isAuthUser(studentKey)) return false;

  if (knownGuestKeys.size >= KNOWN_GUEST_KEYS_MAX) knownGuestKeys.clear();
  knownGuestKeys.add(studentKey);
  return true;
}

/**
 * Guests use their random browser key as a credential. Account ids are not
 * credentials, so once a key belongs to a profile it must be backed by that
 * account's Supabase access token.
 */
export async function canUseStudentKey(request: Request, studentKey: string): Promise<boolean> {
  return (await isAuthenticatedStudent(request, studentKey)) || isGuestKey(studentKey);
}

/** Claiming guest history always targets a real signed-in account. */
export async function isAuthenticatedStudent(request: Request, studentKey: string): Promise<boolean> {
  if (!supabaseAdmin) return true;
  return (await signedInAccount(request))?.id === studentKey;
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
