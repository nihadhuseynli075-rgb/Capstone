const STORAGE_KEY = "examPeak.studentKey";

/**
 * Who the API thinks it is talking to.
 *
 * Signed in, this is the Supabase user id, so history follows the account onto
 * any device. Signed out, it falls back to a random key generated once per
 * browser, which is what lets someone try a test before making an account.
 *
 * Every call into the API goes through `getStudentKey`, so switching between the
 * two is a change in this one file rather than in every request.
 */

let signedInUserId: string | null = null;

/** Called by the auth provider whenever the session changes. */
export function setSignedInUserId(userId: string | null): void {
  signedInUserId = userId;
}

/** The per-browser fallback identity, created on first use. */
export function getGuestKey(): string {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const key = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, key);
  return key;
}

export function getStudentKey(): string {
  return signedInUserId ?? getGuestKey();
}

export function hasGuestHistory(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Retires a guest key once its attempts have been moved onto an account.
 *
 * The old key now owns nothing, and keeping it would mean a later guest session
 * on this browser reuses a key that has already been claimed, so its new
 * attempts would never be moved across. A fresh key keeps each guest spell
 * separate and claimable in its own right.
 */
export function resetGuestKey(): string {
  const key = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, key);
  return key;
}
