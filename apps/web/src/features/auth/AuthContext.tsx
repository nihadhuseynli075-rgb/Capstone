import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { resetGuestKey, setSignedInUserId } from "../../lib/studentKey";
import { authErrorMessage } from "./authErrors";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
}

interface AuthContextValue {
  /** Null until the stored session has been checked, so nothing flashes. */
  ready: boolean;
  user: AuthUser | null;
  configured: boolean;
  signUp: (input: { fullName: string; email: string; password: string }) => Promise<{ needsEmailConfirmation: boolean }>;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  updateName: (fullName: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** The display name lives in user metadata, mirrored into `profiles` by a trigger. */
function toAuthUser(user: User): AuthUser {
  const metadata = user.user_metadata ?? {};
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name : "";

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: fullName.trim().length > 0 ? fullName.trim() : (user.email ?? "").split("@")[0]
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);

  const applySession = useCallback((session: Session | null) => {
    const nextUser = session?.user ? toAuthUser(session.user) : null;
    setUser(nextUser);
    // Keep the API identity in step with the session before any request runs.
    setSignedInUserId(nextUser?.id ?? null);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      applySession(data.session);
      setReady(true);
    });

    // Fires on sign-in, sign-out, token refresh and password change, including
    // in another tab, so the header never shows a stale account.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      applySession(session);
      setReady(true);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [applySession]);

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

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();

    // Start a fresh guest identity. Tests taken from here belong to whoever is
    // using the browser now, not the account just left, and the old key has
    // already been marked as claimed - reusing it would mean this next batch of
    // guest attempts was never moved across on the following sign-in.
    resetGuestKey();
  }, []);

  const updateName = useCallback(async (fullName: string) => {
    if (!supabase) throw new Error(authErrorMessage("not-configured"));

    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });
    if (error) throw new Error(authErrorMessage(error.message));
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
      signUp,
      signIn,
      signOut,
      updateName,
      updatePassword
    }),
    [ready, user, signUp, signIn, signOut, updateName, updatePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider.");
  return context;
}
