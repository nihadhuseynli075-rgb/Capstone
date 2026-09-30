import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { StudentProfile } from "@grade9/shared";
import { ApiError } from "../../services/apiClient";
import * as profileApi from "../../services/profileApi";
import { useAuth } from "../auth/AuthContext";

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
  /** Why loading failed, when the status is "error". */
  error: string | null;
  reload: () => void;
  rename: (fullName: string) => Promise<void>;
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

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [status, setStatus] = useState<ProfileStatus>("signed-out");
  const [error, setError] = useState<string | null>(null);
  const [loads, setLoads] = useState(0);

  // Who is signed in right now, for answers that arrive after that changed.
  const currentUserId = useRef(userId);
  currentUserId.current = userId;

  useEffect(() => {
    if (!ready) return;

    if (!userId) {
      setProfile(null);
      setStatus("signed-out");
      setError(null);
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
        setError((cause as Error).message);
      });

    return () => {
      active = false;
    };
  }, [ready, userId, loads]);

  const reload = useCallback(() => setLoads((count) => count + 1), []);

  /** Takes a profile the API sent back, unless it belongs to someone no longer signed in. */
  const accept = useCallback((next: StudentProfile) => {
    if (next.id !== currentUserId.current) return;
    setProfile(next);
    cacheProfile(next);
    setStatus("ready");
  }, []);

  const rename = useCallback(
    async (fullName: string) => accept(await profileApi.renameProfile(fullName)),
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
      // not be deleted, so show whatever the server now has.
      reload();
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
    () => ({ profile, status, error, reload, rename, uploadPhoto, removePhoto, deleteAccount }),
    [profile, status, error, reload, rename, uploadPhoto, removePhoto, deleteAccount]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useProfile must be used inside a ProfileProvider.");
  return context;
}
