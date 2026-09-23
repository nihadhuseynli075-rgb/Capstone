import { studentKeyLimits } from "@grade9/shared";
import { supabase } from "./supabaseClient";

const STORAGE_KEY = "examPeak.studentKey";
const CLAIMED_KEY = "examPeak.claimedGuestKey";

/**
 * Who the API thinks it is talking to.
 *
 * Signed in, this is the Supabase user id, so history follows the account onto
 * any device. Signed out, it falls back to a random key generated once per
 * browser, which is what lets someone try a test before making an account.
 *
 * Every call into the API goes through `resolveStudentIdentity`, so switching
 * between the two is a change in this one file rather than in every request.
 */

let signedInUserId: string | null = null;

/** Called by the auth provider whenever the session changes. */
export function setSignedInUserId(userId: string | null): void {
  signedInUserId = userId;
}

/** This browser's guest key, if it has one, without creating or replacing it. */
export function peekGuestKey(): string | null {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  // A key the API would refuse fails every request a guest makes, so it is no
  // key at all.
  return existing &&
    existing.length >= studentKeyLimits.min &&
    existing.length <= studentKeyLimits.max
    ? existing
    : null;
}

/**
 * The per-browser fallback identity, created on first use.
 *
 * A key whose tests have been moved onto an account owns nothing any more, and
 * is recorded as claimed. Tests put under it again would never follow the next
 * sign-in, since it is already claimed, so the first time it is needed as a
 * guest key again it is replaced. That covers every way of ending up signed
 * out - the sign out button, a session that ran out, a sign out in another tab -
 * rather than only the button. So each spell as a guest gets its own key, which
 * whoever signs in next claims in its own right.
 */
function guestKey(): string {
  const existing = peekGuestKey();
  if (existing && !isGuestKeyClaimed(existing)) return existing;

  const key = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, key);
  return key;
}

export interface StudentIdentity {
  studentKey: string;
  /** The account's access token, when signed in. */
  token?: string;
}

/**
 * Who a request about to be sent is from: the key, and the token that backs it.
 *
 * Both come from one read of the Supabase session, so they cannot disagree.
 * `signedInUserId` is only set once the stored session has been restored after
 * a page load, and a request sent before then went out under the guest key
 * while carrying the account's token. A paper whose timer ran out while the
 * page was closed submits itself straight away, so it was refused as someone
 * else's test.
 */
export async function resolveStudentIdentity(): Promise<StudentIdentity> {
  if (!supabase) return { studentKey: guestKey() };

  const { data, error } = await supabase.auth.getSession();
  if (data.session) {
    return { studentKey: data.session.user.id, token: data.session.access_token };
  }

  // The session could not be read (a token refresh that failed on the
  // network), which is not the same as being signed out: keep to the identity
  // the app last knew.
  if (error) return { studentKey: signedInUserId ?? guestKey() };

  return { studentKey: guestKey() };
}

export function isGuestKeyClaimed(key: string): boolean {
  return window.localStorage.getItem(CLAIMED_KEY) === key;
}

/** Records that this guest key's tests now belong to an account. */
export function markGuestKeyClaimed(key: string): void {
  window.localStorage.setItem(CLAIMED_KEY, key);
}
