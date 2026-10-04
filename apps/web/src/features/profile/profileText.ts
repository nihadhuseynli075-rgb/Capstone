import type { UsernameProblem } from "@grade9/shared";
import type { TranslationKey } from "../../lib/i18n";
import { ApiError } from "../../services/apiClient";
import { AuthActionError } from "../auth/authErrors";
import type { EmailProblem, NameProblem, PasswordProblem } from "../auth/authValidation";
import type { AuthRedirectResult } from "../auth/oauthRedirect";

/**
 * Words for things going wrong, in the student's language: the profile page's,
 * and the sign-in and sign-up pages'.
 *
 * Supabase and the API both write their error messages in English, for a
 * developer to read. Each failure also has a code that stays the same between
 * releases, so the page picks its sentence by that. An API refusal without a
 * sentence here falls back to the English one it came with, which is still
 * better than hiding what happened. An account error without one gets the
 * plain apology: its English text is already only that (see authErrors).
 */

type Translate = (key: TranslationKey) => string;

// Kept importable from here, where the profile panels have always found it.
export { fill } from "../../lib/i18n";

const AUTH_CODES: Record<string, TranslationKey> = {
  invalid_credentials: "auth.errWrongPassword",
  email_not_confirmed: "auth.errNotConfirmed",
  user_already_exists: "auth.errAccountExists",
  "server-unavailable": "auth.errUnavailable",
  network: "profile.errNetwork",
  unexpected_failure: "auth.errSetupFailed",
  email_exists: "profile.errEmailTaken",
  email_address_invalid: "profile.errEmailInvalid",
  email_address_not_authorized: "profile.errEmailNotAllowed",
  same_password: "profile.errSamePassword",
  weak_password: "profile.errWeakPassword",
  reauthentication_needed: "profile.errReauth",
  reauthentication_not_valid: "profile.errReauth",
  reauth_nonce_missing: "profile.errReauth",
  over_email_send_rate_limit: "profile.errRateLimit",
  over_request_rate_limit: "profile.errRateLimit",
  bad_jwt: "profile.errSignInAgain",
  no_authorization: "profile.errSignInAgain",
  session_not_found: "profile.errSignInAgain",
  session_expired: "profile.errSignInAgain",
  refresh_token_not_found: "profile.errSignInAgain",
  refresh_token_already_used: "profile.errSignInAgain",
  user_not_found: "profile.errSignInAgain",
  identity_already_exists: "profile.errGoogleTaken",
  manual_linking_disabled: "profile.errLinkingOff",
  single_identity_not_deletable: "profile.errOnlyWay",
  "google-not-enabled": "profile.errGoogleOff",
  provider_disabled: "profile.errGoogleOff",
  oauth_provider_not_supported: "profile.errGoogleOff",
  "not-configured": "profile.errNotConfigured"
};

const API_CODES: Record<string, TranslationKey> = {
  "profiles-unavailable": "profile.unavailable",
  "confirmation-mismatch": "profile.deleteMismatch",
  "photo-missing": "profile.errPhotoMissing",
  "photo-empty": "profile.errPhotoEmpty",
  "photo-too-large": "profile.errPhotoSize",
  "photo-type": "profile.errPhotoType",
  "username-taken": "profile.usernameTaken",
  "username-reserved": "profile.usernameReserved",
  "username-invalid": "profile.usernameInvalid"
};

/**
 * What to tell the student about a failure.
 *
 * `overrides` is for a form that knows more than the code does: a generic
 * "validation_failed" from Supabase means a bad email address on the email
 * form, and nothing in particular anywhere else.
 */
export function errorText(
  cause: unknown,
  t: Translate,
  overrides: Record<string, TranslationKey> = {}
): string {
  if (cause instanceof AuthActionError) {
    if (cause.status === 0) return t("profile.errNetwork");

    const key = (cause.code && (overrides[cause.code] ?? AUTH_CODES[cause.code])) || null;
    if (key) return t(key);

    if (cause.status === 429) return t("profile.errRateLimit");
    return t("profile.errGeneric");
  }

  if (cause instanceof ApiError) {
    if (cause.status === 0) return t("profile.errNetwork");

    const key = (cause.code && (overrides[cause.code] ?? API_CODES[cause.code])) || null;
    if (key) return t(key);

    if (cause.status === 401) return t("profile.errSignInAgain");
    // A server failure's message is the server's own ("Failed to accept the
    // request: ..."), written for whoever reads the logs, not for a student.
    if (cause.status >= 500) return t("profile.errGeneric");
    return cause.message;
  }

  return cause instanceof Error && cause.message ? cause.message : t("profile.errGeneric");
}

/**
 * Whether a failure means the session has ended, so the way forward is to sign
 * in again rather than to try again.
 */
export function needsSignInAgain(cause: unknown): boolean {
  if (cause instanceof ApiError) return cause.status === 401;
  if (cause instanceof AuthActionError) return AUTH_CODES[cause.code ?? ""] === "profile.errSignInAgain";
  return false;
}

/** How a trip to Google, or a link from an email, came back with an error. */
export function redirectErrorText(result: AuthRedirectResult, t: Translate): string {
  if (result.errorCode === "otp_expired") return t("profile.errLinkExpired");
  if (result.errorCode === "identity_already_exists") return t("profile.errGoogleTaken");
  if (result.errorCode === "access_denied") return t("profile.errLinkCancelled");
  return result.error ?? t("profile.errGeneric");
}

export function nameProblemText(problem: NameProblem, t: Translate): string {
  if (problem === "empty") return t("profile.nameEmpty");
  return t(problem === "too-short" ? "profile.nameTooShort" : "profile.nameTooLong");
}

export function emailProblemText(problem: EmailProblem, t: Translate): string {
  return t(problem === "empty" ? "profile.emailEmpty" : "profile.emailInvalid");
}

const USERNAME_PROBLEMS: Record<UsernameProblem, TranslationKey> = {
  empty: "profile.usernameEmpty",
  "too-short": "profile.usernameTooShort",
  "too-long": "profile.usernameTooLong",
  "bad-characters": "profile.usernameBadChars",
  "bad-start": "profile.usernameBadStart",
  reserved: "profile.usernameReserved"
};

export function usernameProblemText(problem: UsernameProblem, t: Translate): string {
  return t(USERNAME_PROBLEMS[problem]);
}

export function passwordProblemText(problem: PasswordProblem, t: Translate): string {
  if (problem === "empty") return t("profile.passwordEmpty");
  return t(problem === "too-short" ? "profile.passwordTooShort" : "profile.passwordNeedsMix");
}
