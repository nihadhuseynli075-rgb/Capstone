/**
 * Supabase auth errors, rewritten for a fifteen-year-old.
 *
 * The raw messages are written for developers ("Invalid login credentials",
 * "AuthApiError"), so each one that a student can actually trigger is mapped to
 * something that says what to do next. Anything unmapped falls through
 * unchanged rather than being hidden behind a generic apology.
 */
const MESSAGES: Array<{ match: RegExp; message: string }> = [
  {
    match: /invalid login credentials/i,
    message: "That email and password do not match. Check them and try again."
  },
  {
    match: /email not confirmed/i,
    message: "Confirm your email address first. Check your inbox for the link we sent."
  },
  {
    match: /user already registered|already been registered/i,
    message: "There is already an account with that email. Try signing in instead."
  },
  {
    match: /password should be at least/i,
    message: "That password is too short. Use at least 8 characters."
  },
  {
    match: /new password should be different/i,
    message: "That is already your password. Pick a different one."
  },
  {
    match: /unable to validate email|invalid email/i,
    message: "That does not look like a valid email address."
  },
  {
    match: /email rate limit|over_email_send_rate_limit|too many requests|rate limit/i,
    message: "Too many attempts. Wait a minute and try again."
  },
  {
    match: /failed to fetch|network|load failed/i,
    message: "Could not reach the server. Check your internet connection and try again."
  },
  {
    match: /^not-configured$/,
    message:
      "Accounts are not switched on yet because Supabase is not connected. You can still take tests as a guest."
  }
];

export function authErrorMessage(raw: string): string {
  const hit = MESSAGES.find((entry) => entry.match.test(raw));
  return hit ? hit.message : raw;
}
