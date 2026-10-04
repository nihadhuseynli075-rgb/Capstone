import type { TranslationKey } from "../../lib/i18n";
import type { PasswordStrength } from "./authValidation";
import type { AuthRedirectResult } from "./oauthRedirect";

/**
 * The sign-in and sign-up pages' words that depend on what happened, in the
 * site language. Failures of an account action itself are worded by
 * errorText (profileText), which both these pages and the profile use.
 */

type Translate = (key: TranslationKey) => string;

/**
 * Why a trip to Google, or a link from an email, came back to the sign-in page
 * without signing in. The profile page has its own version: there, the same
 * Cancel means connecting Google was cancelled rather than signing in.
 */
export function signInRedirectErrorText(result: AuthRedirectResult, t: Translate): string {
  if (result.errorCode === "otp_expired") return t("auth.errSignInLinkExpired");
  if (result.errorCode === "identity_already_exists") return t("profile.errGoogleTaken");
  if (result.errorCode === "access_denied") return t("auth.errGoogleCancelled");
  return t("auth.errNotFinished");
}

const STRENGTH: Record<PasswordStrength, TranslationKey> = {
  weak: "auth.strengthWeak",
  fair: "auth.strengthFair",
  strong: "auth.strengthStrong"
};

/** The word under the strength meter on the sign-up form. */
export function strengthText(level: PasswordStrength, t: Translate): string {
  return t(STRENGTH[level]);
}
