import type { AuthError } from "@supabase/supabase-js";
import { replaceRoute } from "../../app/router";
import { redirectErrorMessage } from "./authErrors";

/**
 * Going to Google and coming back.
 *
 * Signing in with Google leaves the app entirely, so anything it needs on the
 * way back has to be written down before it goes. And the way back has two
 * quirks this app's hash routes have to work around:
 *
 * - Supabase hands back the session by adding "#access_token=..." to the
 *   address it returns to, by plainly joining the two. An address that already
 *   has a route in its hash, like ".../#/profile", comes back as
 *   "#/profile#access_token=...", and the session in it cannot be read. So the
 *   trip always returns to the bare page, and where to go from there is kept
 *   in sessionStorage for the length of the trip.
 *
 * - A trip that fails (Cancel on Google's screen, an expired email link) comes
 *   back with the reason in both the query string and the hash, and Supabase
 *   leaves it there. It is read and cleared here, so the router is never asked
 *   to show "error=access_denied&..." as a page.
 */

export type AuthRedirectIntent =
  /** Signing in, or signing up, with Google. */
  | "sign-in"
  /** Connecting Google to the account already signed in, from the profile page. */
  | "link"
  /** A link from an email, such as confirming a new account. Nothing is noted before one. */
  | "email-link";

export interface AuthRedirectResult {
  intent: AuthRedirectIntent;
  /** Null when it worked; otherwise why not, worded for the student. */
  error: string | null;
}

interface PendingRedirect {
  intent: "sign-in" | "link";
  startedAt: number;
}

const PENDING_KEY = "examPeak.authRedirect";

/** Far longer than anyone spends on Google's screen. An older note is from a trip given up on. */
const PENDING_TTL_MS = 30 * 60 * 1000;

const AUTH_PARAMETERS = ["access_token", "error", "error_code", "error_description"];

/**
 * Whether this browser is waiting to swap a code for a session.
 *
 * A "?code=" in the address is only ours while the matching verifier is here,
 * which is the same test the Supabase client makes before it treats a page
 * load as a sign-in. Without it, any address carrying a "code" of its own
 * would be mistaken for one.
 */
function hasStoredCodeVerifier(): boolean {
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      if (window.localStorage.key(index)?.includes("-code-verifier")) return true;
    }
  } catch {
    // Storage refused; treat it as no verifier, as the client would.
  }

  return false;
}

function hasAuthParameters(location: Location): boolean {
  return [location.search.slice(1), location.hash.slice(1)].some((part) => {
    const params = new URLSearchParams(part);
    if (AUTH_PARAMETERS.some((name) => params.has(name))) return true;
    return params.has("code") && hasStoredCodeVerifier();
  });
}

/**
 * Whether this page load is the end of a sign-in redirect.
 *
 * Read once, as the app starts: the Supabase client clears a successful
 * sign-in out of the address soon afterwards, and by then this has to have
 * seen it.
 */
let openedByRedirect = hasAuthParameters(window.location);

// A note is only ever for the page load that comes straight back from Google.
// One left by a trip that was given up on -- Back from Google's account
// picker, or the tab simply closed -- would otherwise be picked up by whatever
// redirect happened next in this tab, up to half an hour later.
if (!openedByRedirect) forgetAuthRedirect();

/** Where Google is told to send the student back to: this page, without a route. */
export function authRedirectUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/** Notes, before leaving for Google, what the trip is for. */
export function rememberAuthRedirect(intent: PendingRedirect["intent"]): void {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ intent, startedAt: Date.now() }));
  } catch {
    // Storage can be refused in private browsing. The trip still works; the
    // student lands on the home page rather than their profile.
  }
}

export function forgetAuthRedirect(): void {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing was stored, then.
  }
}

function takePendingRedirect(): PendingRedirect | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    window.sessionStorage.removeItem(PENDING_KEY);
    if (!raw) return null;

    const pending = JSON.parse(raw) as Partial<PendingRedirect>;
    const known = pending.intent === "sign-in" || pending.intent === "link";
    if (!known || typeof pending.startedAt !== "number") return null;

    return Date.now() - pending.startedAt <= PENDING_TTL_MS ? (pending as PendingRedirect) : null;
  } catch {
    return null;
  }
}

/**
 * Finishes a sign-in redirect once the Supabase client has read it: sends the
 * student on to where the trip was for, and clears the address.
 *
 * Returns how it went, for the page they land on to report, or null when
 * there is nothing to report: the page was not opened by a redirect, or it
 * was an email link that worked, which lands on the home page as it always has.
 */
export function finishAuthRedirect(outcome: {
  signedIn: boolean;
  error: AuthError | null;
}): AuthRedirectResult | null {
  if (!openedByRedirect) return null;
  openedByRedirect = false;

  const pending = takePendingRedirect();
  const intent: AuthRedirectIntent = pending?.intent ?? "email-link";

  if (outcome.error || !outcome.signedIn) {
    // Whoever is still signed in hears about it on their profile: connecting
    // Google starts there, and sending a signed-in student to the sign-in page
    // only bounces them off it again, taking the message with them.
    replaceRoute(outcome.signedIn ? "/profile" : "/login");
    return { intent, error: redirectErrorMessage(outcome.error, intent) };
  }

  if (!pending) return null;

  // Either way the trip ends on the profile, where the Google name and photo
  // (or the newly connected Google account) now show.
  replaceRoute("/profile");
  return { intent, error: null };
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let providersRequest: Promise<Record<string, boolean>> | null = null;

/**
 * Whether the Supabase project has Google switched on.
 *
 * Asked before leaving for Google, because with it switched off Supabase
 * answers the trip with a bare page of JSON the student cannot get back from.
 * Only a yes is kept for the rest of the page's life. A no, or a failure to
 * ask, is asked again on the next press, so switching Google on in Supabase
 * reaches a page that is already open.
 */
export async function isGoogleSignInEnabled(): Promise<boolean> {
  providersRequest ??= fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseAnonKey } })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Supabase answered ${response.status} when asked which sign-ins are on.`);
      const settings = (await response.json()) as { external?: Record<string, boolean> };
      return settings.external ?? {};
    })
    .catch((error: unknown) => {
      providersRequest = null;
      throw error;
    });

  const enabled = (await providersRequest).google === true;
  if (!enabled) providersRequest = null;
  return enabled;
}
