import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { cleanName, isReadableName } from "@grade9/shared";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { clearSessionRecords, settleSessionRecords } from "../../lib/examSession";
import { setSignedInUserId } from "../../lib/studentKey";
import { onAgeRequired } from "../../services/apiClient";
import { confirmAge as confirmAgeWithApi, fetchAgeStatus } from "../../services/profileApi";

/** Asking again where the account stands, after the API could not be reached: a little over three minutes in all. */
const AGE_RETRY_DELAYS_MS = [10_000, 30_000, 60_000, 120_000];
import { AuthActionError, authActionError, authErrorMessage, unreachableError } from "./authErrors";
import {
  authRedirectUrl,
  finishAuthRedirect,
  forgetAuthRedirect,
  isGoogleSignInEnabled,
  rememberAuthRedirect,
  signUpRedirectUrl,
  type AuthRedirectResult
} from "./oauthRedirect";

export interface AuthUser {
  id: string;
  email: string;
  /**
   * The name on the Supabase account. The profile's name is the one to show
   * (see features/profile); this stands in until the profile has loaded.
   */
  fullName: string;
  /** Every way this account can sign in: "email", "google", or both. */
  providers: string[];
  /** The address of the Google account connected to this one, if there is one. */
  googleEmail: string | null;
  /**
   * A new email address waiting for its link to be opened, or null.
   *
   * Until it is opened the account keeps its old address, which is still the
   * one to sign in with.
   */
  pendingEmail: string | null;
  /** When the account was made, as an ISO time; empty if the session did not say. */
  createdAt: string;
  /**
   * Whether the session already shows a recorded year of birth. The API
   * records it in the account's app_metadata, which the session copies; with
   * it, the account is known to have passed the age check without asking.
   */
  ageConfirmed: boolean;
  /**
   * The year typed on the sign-up form, still waiting for the API to record
   * it at the first sign-in, or null. A Google sign-up never has one.
   */
  signUpBirthYear: number | null;
}

/**
 * Where the signed-in account stands with the age check, as far as this tab
 * knows (null while signed out):
 *
 * - "checking": not known yet. The app shows as usual, but takes nothing of
 *   the guest's onto the account until it is known (settleSessionRecords,
 *   useHistoryClaim).
 * - "ok": made before the check began, or its year is recorded.
 * - "pending": a new account that has not given its year. The year step
 *   comes first (AgeCheckPage), and the API refuses everything else.
 * - "unknown": the API could not be asked. Asked again in a while; the
 *   account's own pages work as before, and the API still enforces the check.
 */
export type AgeStatus = "checking" | "ok" | "pending" | "unknown";

/** How giving a year of birth ended (see confirmAge). */
export type AgeOutcome = { outcome: "confirmed" | "account-deleted" } | { outcome: "too-young"; birthYear: number };

interface AuthContextValue {
  /** Null until the stored session has been checked, so nothing flashes. */
  ready: boolean;
  user: AuthUser | null;
  configured: boolean;
  /** How the last trip to Google, or email link, ended: for the page it landed on to report. */
  redirectResult: AuthRedirectResult | null;
  clearRedirectResult: () => void;
  /**
   * Makes an account. With email confirmation on, the link in the email comes
   * back to `returnTo` (home if left out), the page that asked for the sign-up.
   */
  signUp: (input: {
    fullName: string;
    email: string;
    password: string;
    /** Already checked against MIN_ACCOUNT_AGE by the form; the API checks it again. */
    birthYear: number;
    returnTo?: string;
  }) => Promise<{ needsEmailConfirmation: boolean }>;
  /** See AgeStatus. */
  ageStatus: AgeStatus | null;
  /** For a request the API refused with "age-required": the account is pending after all. */
  markAgeRequired: () => void;
  /**
   * Gives a new account's year of birth to the API: `birthYear`, or without it
   * the one typed on the sign-up form. Recorded, the session is refreshed so
   * that it says so. Too young, nothing changes yet: "too-young" comes back
   * with the year, to be shown so a slip can be put right. Sent again with
   * `confirmTooYoung`, the API deletes the new account and this browser is
   * signed out of it; the guest's own tests and paper stay as they were.
   */
  confirmAge: (birthYear?: number, confirmTooYoung?: boolean) => Promise<AgeOutcome>;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  /**
   * Leaves for Google, coming back to `returnTo` (home if left out). Resolves
   * as the browser goes, and throws if it cannot.
   */
  signInWithGoogle: (returnTo?: string) => Promise<void>;
  /** Connects Google to the signed-in account, by the same trip. */
  linkGoogle: () => Promise<void>;
  /** Disconnects Google, when the account has another way in. */
  unlinkGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  /**
   * Asks for a new email address. Supabase emails a link to it, and the
   * address only changes once that link is opened, so `applied` is false
   * unless the project has confirmation switched off.
   */
  updateEmail: (email: string) => Promise<{ applied: boolean }>;
  /** Re-reads the account from Supabase, to notice an email change confirmed elsewhere. */
  refreshUser: () => Promise<void>;
  /**
   * Emails a link for choosing a new password. Resolves the same way whether
   * or not the address has an account; Supabase does not say, and nor should
   * the page.
   */
  requestPasswordReset: (email: string) => Promise<void>;
  /**
   * True once a password reset link has signed this tab in, until a new
   * password is saved or the student signs out. The app sends the student to
   * the reset page when it turns true, wherever the link landed.
   */
  passwordRecovery: boolean;
  /** Called once the new password is saved. */
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(user: User): AuthUser {
  const metadata = user.user_metadata ?? {};
  // Cleaned like a profile name, so one made of invisible characters falls
  // back to the start of the email rather than showing as a blank.
  const fullName = typeof metadata.full_name === "string" ? cleanName(metadata.full_name) : "";

  // Identities are the accurate list. A session saved before they were read
  // may not carry them, and the provider list in the app metadata says the
  // same thing less precisely.
  const identities = user.identities ?? [];
  const fromMetadata = Array.isArray(user.app_metadata?.providers) ? (user.app_metadata.providers as string[]) : [];
  const providers = identities.length > 0 ? identities.map((identity) => identity.provider) : fromMetadata;
  const google = identities.find((identity) => identity.provider === "google");

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: isReadableName(fullName) ? fullName : (user.email ?? "").split("@")[0],
    providers: [...new Set(providers)],
    googleEmail: typeof google?.identity_data?.email === "string" ? google.identity_data.email : null,
    pendingEmail: typeof user.new_email === "string" && user.new_email.length > 0 ? user.new_email : null,
    createdAt: typeof user.created_at === "string" ? user.created_at : "",
    // Written by the API alone (app_metadata), so it can be read as it is.
    ageConfirmed:
      typeof user.app_metadata?.birth_year === "number" && typeof user.app_metadata?.age_confirmed_at === "string",
    // Not once Google has signed in to the account: the year may be a
    // stranger's (see signUpBirthYear in the API), so its owner is asked.
    signUpBirthYear:
      !providers.includes("google") && typeof metadata.birth_year === "number" && Number.isInteger(metadata.birth_year)
        ? metadata.birth_year
        : null
  };
}

/** Throws the student-facing reason when Google cannot be used right now. */
async function requireGoogle(): Promise<void> {
  let enabled: boolean;

  try {
    enabled = await isGoogleSignInEnabled();
  } catch (cause) {
    // Its own message is for a developer ("Supabase answered 503 when asked
    // which sign-ins are on"), so only how it failed is kept.
    throw cause instanceof AuthActionError ? cause : unreachableError(0);
  }

  if (!enabled) throw new AuthActionError(authErrorMessage("google-not-enabled"), "google-not-enabled");
}

/**
 * The account calls that read the session and save a new one, run one at a time.
 *
 * supabase-js (2.112) does not hold a lock across them. Each reads the stored
 * session, talks to the server, and saves what came back, so two that overlap
 * each save the copy they started from. A token refresh uses up the refresh
 * token and stores the next one; an updateUser that began before it finished
 * then stored the old one back. That token is refused from then on: the tab
 * never noticed a confirmed email change, and signed the student out when the
 * access token ran out. It happened whenever "Send the link again" was pressed
 * just as the tab came back into focus, which is how a student returns from
 * their inbox. Each call here now waits for the one before it to finish.
 */
let accountCalls: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = accountCalls.then(task);
  // The next call waits for this one to finish, whether or not it worked.
  accountCalls = run.catch(() => undefined);
  return run;
}

/**
 * The options for every trip to Google.
 *
 * `select_account` shows Google's account picker every time, so someone on a
 * shared school computer picks their own account rather than walking straight
 * into whoever used it last.
 */
function googleTripOptions() {
  return { redirectTo: authRedirectUrl(), queryParams: { prompt: "select_account" } };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [redirectResult, setRedirectResult] = useState<AuthRedirectResult | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const [ageStatus, setAgeStatus] = useState<AgeStatus | null>(null);

  // Who the tab's records were last settled for. Undefined until the first
  // time, so the first page load settles what the tab holds as well as a
  // later change does.
  const settledFor = useRef<string | null | undefined>(undefined);

  const applySession = useCallback((session: Session | null) => {
    const nextUser = session?.user ? toAuthUser(session.user) : null;
    setUser(nextUser);
    // Keep the API identity in step with the session before any request runs.
    setSignedInUserId(nextUser?.id ?? null);
  }, []);

  const userId = user?.id ?? null;
  const tokenShowsAge = user?.ageConfirmed ?? false;

  // Where the account stands with the age check: from the session when it
  // already shows a recorded year, otherwise asked of the API, which alone
  // knows whether the account is older than the check (see AgeStatus).
  useEffect(() => {
    if (!userId) {
      setAgeStatus(null);
      return;
    }

    if (tokenShowsAge) {
      setAgeStatus("ok");
      return;
    }

    let stopped = false;
    let retryTimer: number | undefined;
    setAgeStatus("checking");

    const ask = (retriesUsed: number) => {
      fetchAgeStatus()
        .then((status) => {
          if (!stopped) setAgeStatus(status === "pending" ? "pending" : "ok");
        })
        .catch(() => {
          if (stopped) return;
          setAgeStatus("unknown");
          if (retriesUsed < AGE_RETRY_DELAYS_MS.length) {
            retryTimer = window.setTimeout(() => ask(retriesUsed + 1), AGE_RETRY_DELAYS_MS[retriesUsed]);
          }
        });
    };
    ask(0);

    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
    };
  }, [userId, tokenShowsAge]);

  // The result and the paper in progress are kept in the tab, and signing out
  // does not empty it. Whoever is signed in after a change - nobody, another
  // account, or the same person after a session that ended in another tab -
  // must not find the last student's test there. A guest who has just signed
  // in keeps their own (see settleSessionRecords), but only once the account
  // is known to have passed the age check: a new account refused at the year
  // step must leave the guest's paper and results as the guest's. A token
  // refresh or a tab coming back to focus reports the same account again, and
  // changes nothing.
  useEffect(() => {
    if (!ready) return;
    if (userId !== null && ageStatus !== "ok") return;
    if (settledFor.current === userId) return;

    settledFor.current = userId;
    settleSessionRecords();
  }, [ready, userId, ageStatus]);

  const markAgeRequired = useCallback(() => {
    setAgeStatus((current) => (current === null ? current : "pending"));
  }, []);

  // Whatever request finds the account still has to give its year says so
  // here too (see apiClient), so the step shows even after asking where the
  // account stands has failed for a while. Only a refusal of the signed-in
  // account's own request counts: one sent for an account since signed out
  // can be answered after another has signed in, and sent that one, which may
  // have nothing to answer, to the step.
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;

  useEffect(
    () =>
      onAgeRequired((refusedFor) => {
        if (refusedFor !== null && refusedFor === userIdRef.current) markAgeRequired();
      }),
    [markAgeRequired]
  );

  // For callbacks that must not be remade on every change of it (signOut).
  const ageStatusRef = useRef<AgeStatus | null>(null);
  ageStatusRef.current = ageStatus;

  useEffect(() => {
    if (!supabase) return;

    const client = supabase;
    let active = true;

    // Ready waits for the redirect to be finished as well as the session, so
    // the first page drawn is already the right one: never a flash of a
    // "page" made out of an error in the address.
    async function start() {
      try {
        // Resolves once the client has read any sign-in the address carried
        // back, with the reason when that sign-in failed.
        const { error } = await client.auth.initialize();
        const { data } = await client.auth.getSession();
        if (!active) return;

        applySession(data.session);
        setRedirectResult(finishAuthRedirect({ signedIn: data.session !== null, error }));
      } finally {
        // Whatever went wrong above, the app must not sit on its loading screen.
        if (active) setReady(true);
      }
    }

    void start();

    // Fires on sign-in, sign-out, token refresh and password change, including
    // in another tab, so the header never shows a stale account.
    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      applySession(session);

      // A password reset link signs the tab in with this event instead of
      // SIGNED_IN. Whoever opened it is here to choose a new password.
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      if (!session) setPasswordRecovery(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [applySession]);

  const clearRedirectResult = useCallback(() => setRedirectResult(null), []);

  const signUp = useCallback<AuthContextValue["signUp"]>(async ({ fullName, email, password, birthYear, returnTo }) => {
    if (!supabase) throw new AuthActionError(authErrorMessage("not-configured"), "not-configured");

    // Without a redirect of its own the confirmation link went to the
    // project's Site URL, the home page, whichever page the student had
    // pressed Sign up on (see signUpRedirectUrl). The year of birth travels
    // in the account's metadata until the first sign-in, when the API records
    // it (confirmAge), so the student is not asked for it twice.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: cleanName(fullName), birth_year: birthYear },
        emailRedirectTo: signUpRedirectUrl(returnTo)
      }
    });

    if (error) throw authActionError(error);

    // With email confirmation switched on, Supabase creates the user but no
    // session. Say so rather than dropping them on a page that looks signed out.
    return { needsEmailConfirmation: data.session === null };
  }, []);

  const signIn = useCallback<AuthContextValue["signIn"]>(async ({ email, password }) => {
    if (!supabase) throw new AuthActionError(authErrorMessage("not-configured"), "not-configured");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw authActionError(error);
  }, []);

  const signInWithGoogle = useCallback(async (returnTo?: string) => {
    if (!supabase) throw new AuthActionError(authErrorMessage("not-configured"), "not-configured");
    await requireGoogle();

    // Google creates the account if there is none yet, so this is signing up
    // as well as signing in.
    rememberAuthRedirect("sign-in", returnTo);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: googleTripOptions() });

    if (error) {
      forgetAuthRedirect();
      throw authActionError(error);
    }
  }, []);

  const linkGoogle = useCallback(async () => {
    if (!supabase) throw new AuthActionError(authErrorMessage("not-configured"), "not-configured");
    await requireGoogle();

    rememberAuthRedirect("link");
    const { error } = await supabase.auth.linkIdentity({ provider: "google", options: googleTripOptions() });

    if (error) {
      forgetAuthRedirect();
      throw authActionError(error);
    }
  }, []);

  const unlinkGoogle = useCallback(
    () =>
      oneAtATime(async () => {
        if (!supabase) throw new AuthActionError(authErrorMessage("not-configured"), "not-configured");

        const { data, error } = await supabase.auth.getUserIdentities();
        if (error) throw authActionError(error);

        const google = data.identities.find((identity) => identity.provider === "google");
        if (!google) return;

        const { error: unlinkError } = await supabase.auth.unlinkIdentity(google);
        if (unlinkError) throw authActionError(unlinkError);

        // The session still lists Google until it is refreshed, and the refresh
        // is what tells the rest of the app.
        await supabase.auth.refreshSession();
      }),
    []
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    // This browser's session only. supabase-js ends every session the account
    // has unless told otherwise, so signing out of a school computer signed
    // the student's phone out too, and whatever the phone sent next was
    // refused. Deleting the account is no different: deleting the user ends
    // all of its sessions on the server, so its sign-out here only has this
    // tab left to clear.
    const { error } = await supabase.auth.signOut({ scope: "local" });

    // The session change this causes already settles the tab (see the settling
    // above). Said again so that does not depend on the event arriving, but
    // only for an account that had passed the age check: one that had not
    // (signing out from the year step, say) never took the tab's records on,
    // so they are still the guest's paper and results, and are kept.
    if (!error && ageStatusRef.current === "ok") clearSessionRecords();

    // No new guest key is made here. A key whose tests were moved onto the
    // account is recorded as claimed and replaced the first time it is needed
    // again (see guestKey in lib/studentKey), which also covers a session that
    // simply ran out.
    // A key whose move never happened is kept, so those tests are still there
    // to be claimed at the next sign-in rather than stranded under a key this
    // browser has forgotten.
  }, []);

  const confirmAge = useCallback(async (birthYear?: number, confirmTooYoung = false): Promise<AgeOutcome> => {
    if (!supabase) throw new AuthActionError(authErrorMessage("not-configured"), "not-configured");
    const client = supabase;

    const answer = await confirmAgeWithApi(birthYear, confirmTooYoung);

    // Nothing has changed: the page shows the year so a slip can be put right.
    if (answer.outcome === "too-young") return answer;

    if (answer.outcome === "account-deleted") {
      // The account is gone, and every session it had on the server with it;
      // only this tab's copy is left to clear. The tab's records are left
      // alone: the account never took them on (see the settling above), so
      // they are the guest's paper and results, as they were before signing in.
      await client.auth.signOut({ scope: "local" });
      return { outcome: "account-deleted" };
    }

    // An account made before the check began has nothing to give.
    if (answer.outcome === "exempt") {
      setAgeStatus("ok");
      return { outcome: "confirmed" };
    }

    // The session holds the account as it was before the year was recorded.
    // A refresh brings the new app_metadata into it, and tells the rest of
    // the app through onAuthStateChange. One at a time, like every call that
    // saves a new session (see oneAtATime).
    await oneAtATime(async () => {
      const { error } = await client.auth.refreshSession();
      if (error) throw authActionError(error);
    });

    setAgeStatus("ok");
    return { outcome: "confirmed" };
  }, []);

  const updatePassword = useCallback(
    (password: string) =>
      oneAtATime(async () => {
        if (!supabase) throw new AuthActionError(authErrorMessage("not-configured"), "not-configured");

        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw authActionError(error);
      }),
    []
  );

  const updateEmail = useCallback<AuthContextValue["updateEmail"]>(
    (email) =>
      oneAtATime(async () => {
        if (!supabase) throw new AuthActionError(authErrorMessage("not-configured"), "not-configured");

        // The link in the email comes back to the site's bare address, like every
        // other trip away from the app (see oauthRedirect), so that address has to
        // be one of the project's Redirect URLs.
        const { data, error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: authRedirectUrl() });
        if (error) throw authActionError(error);

        // Nothing left waiting means the project applied the change at once.
        return { applied: !data.user?.new_email };
      }),
    []
  );

  const refreshUser = useCallback(
    () =>
      oneAtATime(async () => {
        if (!supabase) return;

        // The session holds a copy of the account from the last time it was
        // refreshed. Opening the link in another browser or tab does not touch
        // this one, so ask the server who the account is now. That read changes
        // nothing; only when the address has actually moved is the session
        // refreshed, which brings the new account into it and tells the rest of
        // the app through onAuthStateChange. A refresh uses up the refresh
        // token, so it is not spent on every return to the tab.
        const { data: stored } = await supabase.auth.getSession();
        if (!stored.session) return;

        const { data, error } = await supabase.auth.getUser();
        if (error) throw authActionError(error);

        const before = stored.session.user;
        const moved =
          data.user.email !== before.email || (data.user.new_email ?? null) !== (before.new_email ?? null);
        if (!moved) return;

        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) throw authActionError(refreshError);
      }),
    []
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) throw new AuthActionError(authErrorMessage("not-configured"), "not-configured");

    // The link comes back to the reset page. With pkce the code arrives in the
    // query ("?code=...#/reset-password"), so the route survives the trip. A
    // project that does not allow this address sends the link to its Site URL
    // instead, and the PASSWORD_RECOVERY event above still finds the page.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${authRedirectUrl()}#/reset-password`
    });
    if (error) throw authActionError(error);
  }, []);

  const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      configured: isSupabaseConfigured,
      redirectResult,
      clearRedirectResult,
      signUp,
      ageStatus,
      markAgeRequired,
      confirmAge,
      signIn,
      signInWithGoogle,
      linkGoogle,
      unlinkGoogle,
      signOut,
      updatePassword,
      updateEmail,
      refreshUser,
      requestPasswordReset,
      passwordRecovery,
      clearPasswordRecovery
    }),
    [
      ageStatus,
      markAgeRequired,
      confirmAge,
      ready,
      user,
      redirectResult,
      clearRedirectResult,
      signUp,
      signIn,
      signInWithGoogle,
      linkGoogle,
      unlinkGoogle,
      signOut,
      updatePassword,
      updateEmail,
      refreshUser,
      requestPasswordReset,
      passwordRecovery,
      clearPasswordRecovery
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider.");
  return context;
}
