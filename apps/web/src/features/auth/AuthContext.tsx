import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { setSignedInUserId } from "../../lib/studentKey";
import { authErrorMessage } from "./authErrors";
import {
  authRedirectUrl,
  finishAuthRedirect,
  forgetAuthRedirect,
  isGoogleSignInEnabled,
  rememberAuthRedirect,
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
}

interface AuthContextValue {
  /** Null until the stored session has been checked, so nothing flashes. */
  ready: boolean;
  user: AuthUser | null;
  configured: boolean;
  /** How the last trip to Google, or email link, ended: for the page it landed on to report. */
  redirectResult: AuthRedirectResult | null;
  clearRedirectResult: () => void;
  signUp: (input: { fullName: string; email: string; password: string }) => Promise<{ needsEmailConfirmation: boolean }>;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  /** Leaves for Google. Resolves as the browser goes, and throws if it cannot. */
  signInWithGoogle: () => Promise<void>;
  /** Connects Google to the signed-in account, by the same trip. */
  linkGoogle: () => Promise<void>;
  /** Disconnects Google, when the account has another way in. */
  unlinkGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(user: User): AuthUser {
  const metadata = user.user_metadata ?? {};
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name : "";

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
    fullName: fullName.trim().length > 0 ? fullName.trim() : (user.email ?? "").split("@")[0],
    providers: [...new Set(providers)],
    googleEmail: typeof google?.identity_data?.email === "string" ? google.identity_data.email : null
  };
}

/** Throws the student-facing reason when Google cannot be used right now. */
async function requireGoogle(): Promise<void> {
  let enabled: boolean;

  try {
    enabled = await isGoogleSignInEnabled();
  } catch (cause) {
    throw new Error(authErrorMessage((cause as Error).message));
  }

  if (!enabled) throw new Error(authErrorMessage("google-not-enabled"));
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

  const applySession = useCallback((session: Session | null) => {
    const nextUser = session?.user ? toAuthUser(session.user) : null;
    setUser(nextUser);
    // Keep the API identity in step with the session before any request runs.
    setSignedInUserId(nextUser?.id ?? null);
  }, []);

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
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      applySession(session);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [applySession]);

  const clearRedirectResult = useCallback(() => setRedirectResult(null), []);

  const signUp = useCallback<AuthContextValue["signUp"]>(async ({ fullName, email, password }) => {
    if (!supabase) throw new Error(authErrorMessage("not-configured"));

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim() } }
    });

    if (error) throw new Error(authErrorMessage(error.message));

    // With email confirmation switched on, Supabase creates the user but no
    // session. Say so rather than dropping them on a page that looks signed out.
    return { needsEmailConfirmation: data.session === null };
  }, []);

  const signIn = useCallback<AuthContextValue["signIn"]>(async ({ email, password }) => {
    if (!supabase) throw new Error(authErrorMessage("not-configured"));

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(authErrorMessage(error.message));
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error(authErrorMessage("not-configured"));
    await requireGoogle();

    // Google creates the account if there is none yet, so this is signing up
    // as well as signing in.
    rememberAuthRedirect("sign-in");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: googleTripOptions() });

    if (error) {
      forgetAuthRedirect();
      throw new Error(authErrorMessage(error.message));
    }
  }, []);

  const linkGoogle = useCallback(async () => {
    if (!supabase) throw new Error(authErrorMessage("not-configured"));
    await requireGoogle();

    rememberAuthRedirect("link");
    const { error } = await supabase.auth.linkIdentity({ provider: "google", options: googleTripOptions() });

    if (error) {
      forgetAuthRedirect();
      throw new Error(authErrorMessage(error.message));
    }
  }, []);

  const unlinkGoogle = useCallback(async () => {
    if (!supabase) throw new Error(authErrorMessage("not-configured"));

    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) throw new Error(authErrorMessage(error.message));

    const google = data.identities.find((identity) => identity.provider === "google");
    if (!google) return;

    const { error: unlinkError } = await supabase.auth.unlinkIdentity(google);
    if (unlinkError) throw new Error(authErrorMessage(unlinkError.message));

    // The session still lists Google until it is refreshed, and the refresh
    // is what tells the rest of the app.
    await supabase.auth.refreshSession();
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();

    // No new guest key is made here. A key whose tests were moved onto the
    // account is recorded as claimed and replaced the first time it is needed
    // again (see guestKey in lib/studentKey), which also covers a session that
    // simply ran out.
    // A key whose move never happened is kept, so those tests are still there
    // to be claimed at the next sign-in rather than stranded under a key this
    // browser has forgotten.
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error(authErrorMessage("not-configured"));

    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(authErrorMessage(error.message));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      configured: isSupabaseConfigured,
      redirectResult,
      clearRedirectResult,
      signUp,
      signIn,
      signInWithGoogle,
      linkGoogle,
      unlinkGoogle,
      signOut,
      updatePassword
    }),
    [
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
      updatePassword
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider.");
  return context;
}
