import { isAuthImplicitGrantRedirectError, isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";

/**
 * Supabase auth errors, rewritten for a fifteen-year-old.
 *
 * The raw messages are written for developers ("Invalid login credentials",
 * "AuthApiError"), so each one that a student can actually trigger is mapped to
 * something that says what to do next. Each also has the code Supabase sends
 * for it, which is what a page in the student's own language picks its words
 * by (see profileText); the code is worked out from the message for a server
 * too old to send one.
 *
 * Anything unmapped gets a plain apology rather than its raw text. That text
 * was never written for a student: when the auth server was down it was the
 * failed response turned into a string, a bare "{}".
 */
const MESSAGES: Array<{ match: RegExp; code: string; message: string }> = [
  {
    match: /invalid login credentials/i,
    code: "invalid_credentials",
    message: "That email and password do not match. Check them and try again."
  },
  {
    match: /email not confirmed/i,
    code: "email_not_confirmed",
    message: "Confirm your email address first. Check your inbox for the link we sent."
  },
  {
    match: /user already registered|already been registered/i,
    code: "user_already_exists",
    message: "There is already an account with that email. Try signing in instead."
  },
  {
    match: /password should be at least/i,
    code: "weak_password",
    message: "That password is too short. Use at least 8 characters."
  },
  {
    match: /new password should be different/i,
    code: "same_password",
    message: "That is already your password. Pick a different one."
  },
  {
    match: /unable to validate email|invalid email/i,
    code: "email_address_invalid",
    message: "That does not look like a valid email address."
  },
  {
    match: /email rate limit|over_email_send_rate_limit|too many requests|rate limit/i,
    code: "over_request_rate_limit",
    message: "Too many attempts. Wait a minute and try again."
  },
  {
    match: /failed to fetch|network|load failed/i,
    code: "network",
    message: "Could not reach the server. Check your internet connection and try again."
  },
  {
    match: /^not-configured$/,
    code: "not-configured",
    message:
      "Accounts are not switched on yet because Supabase is not connected. You can still take tests as a guest."
  },
  {
    match: /^google-not-enabled$|provider is not enabled|unsupported provider/i,
    code: "google-not-enabled",
    message: "Signing in with Google is not switched on yet. Use your email and password for now."
  },
  {
    match: /manual linking is disabled|manual_linking_disabled/i,
    code: "manual_linking_disabled",
    message: "Connecting Google to an account that already exists is not switched on yet."
  },
  {
    match: /identity is already linked|identity_already_exists/i,
    code: "identity_already_exists",
    message: "That Google account is already connected to a different Exampeak account."
  },
  {
    match: /at least 1 identity|single_identity_not_deletable/i,
    code: "single_identity_not_deletable",
    message: "Google is the only way into this account, so it cannot be disconnected."
  },
  {
    match: /database error saving new user/i,
    code: "unexpected_failure",
    message: "Your account could not be set up just now. Try again in a moment."
  }
];

/** For anything the list above does not know. */
const GENERIC_MESSAGE = "Something went wrong. Try again in a moment.";

/** The auth server answered that it is down or restarting (502, 503 or 504). */
const UNAVAILABLE_MESSAGE = "Could not reach the server. Try again in a moment.";

export function authErrorMessage(raw: string): string {
  const hit = MESSAGES.find((entry) => entry.match.test(raw));
  return hit ? hit.message : GENERIC_MESSAGE;
}

function codeFromMessage(raw: string): string | null {
  return MESSAGES.find((entry) => entry.match.test(raw))?.code ?? null;
}

/**
 * A failed account action, for a page that shows errors in the student's own
 * language.
 *
 * `message` is the English sentence above, so anywhere that just prints it
 * still reads sensibly. `code` is Supabase's own name for what went wrong
 * ("email_exists", "same_password"), which does not change between releases
 * the way its sentences do, and is what a translated page picks its text by.
 * `status` is 0 when the server could not be reached at all.
 */
export class AuthActionError extends Error {
  readonly code: string | null;
  readonly status: number | null;

  constructor(message: string, code: string | null = null, status: number | null = null) {
    super(message);
    this.name = "AuthActionError";
    this.code = code;
    this.status = status;
  }
}

/**
 * The auth server out of reach: no answer at all (status 0), or an answer
 * that it is down (502 to 504). Supabase's own message for either is whatever
 * the failed response turned into as a string, often "{}".
 */
export function unreachableError(status: number): AuthActionError {
  return status === 0
    ? new AuthActionError(authErrorMessage("network"), "network", 0)
    : new AuthActionError(UNAVAILABLE_MESSAGE, "server-unavailable", status);
}

export function authActionError(error: { message: string; code?: string; status?: number }): AuthActionError {
  if (isAuthRetryableFetchError(error)) return unreachableError(error.status ?? 0);

  return new AuthActionError(
    authErrorMessage(error.message),
    error.code ?? codeFromMessage(error.message),
    error.status ?? null
  );
}

/**
 * Why a trip to Google, or a link from an email, came back without signing in.
 *
 * Supabase sends the reason back as a code and a sentence. The code is the
 * steadier thing to go on, since the sentences are reworded between releases.
 */
export function redirectErrorMessage(error: AuthError | null, intent: "sign-in" | "link" | "email-link"): string {
  const code = redirectErrorCode(error);

  if (code === "otp_expired") {
    return "That link has expired or has already been used. Sign in, or sign up again to be sent a new one.";
  }

  if (code === "identity_already_exists") return authErrorMessage("identity_already_exists");

  // Pressing Cancel on Google's screen.
  if (code === "access_denied") {
    return intent === "link"
      ? "Connecting Google was cancelled, so nothing has changed."
      : "Signing in with Google was cancelled. Try again, or use your email and password.";
  }

  return error ? authErrorMessage(error.message) : "Signing in did not finish. Try again.";
}

/**
 * Which of the failures above a redirect came back with, or null for any other.
 *
 * Kept beside the sentence so the profile page, which shows these in the
 * student's own language, picks its text by the same thing the English
 * one is picked by.
 */
export function redirectErrorCode(error: AuthError | null): "otp_expired" | "identity_already_exists" | "access_denied" | null {
  const details = error && isAuthImplicitGrantRedirectError(error) ? error.details : null;

  if (details?.code === "otp_expired") return "otp_expired";
  if (details?.code === "identity_already_exists") return "identity_already_exists";
  if (details?.error === "access_denied") return "access_denied";
  return null;
}
