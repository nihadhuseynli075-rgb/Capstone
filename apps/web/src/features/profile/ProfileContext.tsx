import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { StudentProfile } from "@grade9/shared";
import { ApiError } from "../../services/apiClient";
import * as profileApi from "../../services/profileApi";
import { useAuth } from "../auth/AuthContext";
import { needsSignInAgain } from "./profileText";

/**
 * The signed-in student's profile, shared by the header and the profile page.
 *
 * The profile is the name and photo to show. The name on the Supabase account
 * is only a stand-in until this loads: signing in with Google rewrites that
 * one from Google every time (see packages/shared, StudentProfile).
 */

export type ProfileStatus =
  | "signed-out"
  | "loading"
  | "ready"
  /** The API is running without Supabase, so it has no profiles to give. */
  | "unavailable"
  | "error";

interface ProfileContextValue {
  /** The latest profile, or the one this browser saw last until that arrives. */
  profile: StudentProfile | null;
  status: ProfileStatus;
  /**
   * Why loading failed, when the status is "error": the failure itself, which
   * the page words in the site language (errorText). Its message is English
   * and can be a developer's.
   */
  error: unknown;
  reload: () => void;
  /**
   * Whether this tab's sign-in has been found to have ended: signed out on
   * another device, or run out. The tab cannot tell until something it sends
   * is refused, and from then on everything is, so the profile page says it
   * once, with the way to sign in again, rather than in every panel. It holds
   * until the account changes: a save the API still lets through proves
   * nothing, since the API can accept a signed-out session's token until it
   * runs out, about an hour later (see signedInAccount in the API).
   */
  signInEnded: boolean;
  /** How many presses of a button have found the sign-in ended, so the page can take the student to its message after each. */
  signInEndedPresses: number;
  /**
   * Looks at a failure from one of the profile page's panels. True when it
   * means the sign-in has ended, which is then marked for the page to say; the
   * panel says nothing of its own. Unless `quiet`, it also counts as a press
   * (signInEndedPresses), for a failure that came from pressing something: the
   * message can be a long way up the page from the button. A check that runs
   * while the student types is quiet, so it does not take them from the box.
   */
  noteSignInEnded: (cause: unknown, options?: { quiet?: boolean }) => boolean;
  /** Saves a new name, username, or both. Throws the API's reason when it is refused. */
  updateDetails: (changes: { fullName?: string; username?: string }) => Promise<void>;
  uploadPhoto: (photo: Blob) => Promise<void>;
  removePhoto: () => Promise<void>;
  /** Deletes the account for good, then signs this browser out of it. */
  deleteAccount: (confirmEmail: string) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * The last profile seen in this browser.
 *
 * Without it the header showed initials and the account's own name on every
 * page load, then swapped in the photo and the chosen name a moment later.
 * It holds nothing the stored Supabase session does not already, and it is
 * cleared on sign-out along with that session.
 */
const CACHE_KEY = "examPeak.profile";

function readCachedProfile(userId: string): StudentProfile | null {
  try {
    const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null") as StudentProfile | null;
    return cached?.id === userId ? cached : null;
  } catch {
    return null;
  }
}

function cacheProfile(profile: StudentProfile | null): void {
  try {
    if (profile) window.localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
    else window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage can be refused. The cache only saves a moment on the next load.
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { ready, user, signOut } = useAuth();
  const userId = user?.id ?? null;
  // The profile keeps its own copy of the account's email address, so a change
  // of address (confirmed here, or in another browser) is a reason to load it again.
  const userEmail = user?.email ?? null;

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [status, setStatus] = useState<ProfileStatus>("signed-out");
  const [error, setError] = useState<unknown>(null);
  const [loads, setLoads] = useState(0);

  // The account whose sign-in was found to have ended. Kept by account, so
  // the next one to sign in in this tab starts without it.
  const [endedFor, setEndedFor] = useState<string | null>(null);
  const [signInEndedPresses, setSignInEndedPresses] = useState(0);
  const signInEnded = userId !== null && endedFor === userId;

  // Who is signed in right now, for answers that arrive after that changed.
  const currentUserId = useRef(userId);
  currentUserId.current = userId;

  useEffect(() => {
    if (!ready) return;

    if (!userId) {
      setProfile(null);
      setStatus("signed-out");
      setError(null);
      // Signing out is the way to sign in again, and the same account then
      // comes back with a sign-in that works.
      setEndedFor(null);
      cacheProfile(null);
      return;
    }

    let active = true;

    setProfile((current) => (current?.id === userId ? current : readCachedProfile(userId)));
    setStatus("loading");
    setError(null);

    profileApi
      .fetchProfile()
      .then((loaded) => {
        if (!active) return;
        setProfile(loaded);
        cacheProfile(loaded);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (!active) return;

        if (cause instanceof ApiError && cause.code === "profiles-unavailable") {
          setStatus("unavailable");
          return;
        }

        setStatus("error");
        setError(cause);
        if (needsSignInAgain(cause)) setEndedFor(userId);
      });

    return () => {
      active = false;
    };
  }, [ready, userId, userEmail, loads]);

  const reload = useCallback(() => setLoads((count) => count + 1), []);

  const noteSignInEnded = useCallback(
    (cause: unknown, { quiet = false }: { quiet?: boolean } = {}) => {
      if (!needsSignInAgain(cause)) return false;

      // A refusal that comes back after the account has changed was about the
      // last one, and says nothing about this one.
      if (userId === null || userId !== currentUserId.current) return true;

      setEndedFor(userId);
      if (!quiet) setSignInEndedPresses((count) => count + 1);
      return true;
    },
    [userId]
  );

  /** Takes a profile the API sent back, unless it belongs to someone no longer signed in. */
  const accept = useCallback((next: StudentProfile) => {
    if (next.id !== currentUserId.current) return;
    setProfile(next);
    cacheProfile(next);
    setStatus("ready");
  }, []);

  const updateDetails = useCallback(
    async (changes: { fullName?: string; username?: string }) => accept(await profileApi.updateProfile(changes)),
    [accept]
  );

  const uploadPhoto = useCallback(
    async (photo: Blob) => accept(await profileApi.uploadProfilePhoto(photo)),
    [accept]
  );

  const removePhoto = useCallback(async () => {
    try {
      accept(await profileApi.removeProfilePhoto());
    } catch (cause) {
      // The photo can be off the profile already even though its file could
      // not be deleted, so show whatever the server now has. A sign-in that
      // has ended changed nothing, and asking again would only be refused too.
      if (!needsSignInAgain(cause)) reload();
      throw cause;
    }
  }, [accept, reload]);

  const deleteAccount = useCallback(
    async (confirmEmail: string) => {
      await profileApi.deleteAccount(confirmEmail);
      cacheProfile(null);
      setProfile(null);
      // The account is gone, so the session this browser holds is for nobody.
      await signOut();
    },
    [signOut]
  );

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      status,
      error,
      reload,
      signInEnded,
      signInEndedPresses,
      noteSignInEnded,
      updateDetails,
      uploadPhoto,
      removePhoto,
      deleteAccount
    }),
    [
      profile,
      status,
      error,
      reload,
      signInEnded,
      signInEndedPresses,
      noteSignInEnded,
      updateDetails,
      uploadPhoto,
      removePhoto,
      deleteAccount
    ]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useProfile must be used inside a ProfileProvider.");
  return context;
}
