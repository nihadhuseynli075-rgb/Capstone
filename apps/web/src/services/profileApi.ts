import type { StudentProfile } from "@grade9/shared";
import { supabase } from "../lib/supabaseClient";
import { ApiError, apiRequest } from "./apiClient";

/**
 * The signed-in student's own profile.
 *
 * Unlike tests and history, nothing here has a guest version: a profile
 * belongs to an account, so every call carries the account's access token and
 * the API works out whose profile it is from that alone.
 */

async function accountToken(): Promise<string> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (!session) throw new ApiError("Sign in again to continue.", 401);
  return session.access_token;
}

export async function fetchProfile(): Promise<StudentProfile> {
  const { profile } = await apiRequest<{ profile: StudentProfile }>("/api/profile", {
    token: await accountToken()
  });
  return profile;
}

/**
 * Saves a new name, a new username, or both in one go: the API writes them
 * together, so a username that is refused leaves the name as it was.
 */
export async function updateProfile(changes: { fullName?: string; username?: string }): Promise<StudentProfile> {
  const { profile } = await apiRequest<{ profile: StudentProfile }>("/api/profile", {
    method: "PATCH",
    body: changes,
    token: await accountToken()
  });
  return profile;
}

/** What the API says about a username while it is being typed. */
export interface UsernameCheck {
  /** The name as it would be saved. */
  username: string;
  available: boolean;
  /** Why not; "yours" is a name the asking student already has, and counts as available. */
  reason: "taken" | "reserved" | "invalid" | "yours" | null;
}

export async function checkUsername(username: string): Promise<UsernameCheck> {
  return apiRequest<UsernameCheck>(`/api/profile/username-available?username=${encodeURIComponent(username)}`, {
    token: await accountToken()
  });
}

/** The bytes of a file as base64, which is how the API takes uploads. */
function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // A data URL: "data:image/jpeg;base64,...". Only the part after the comma is the file.
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("That photo could not be read."));
    reader.readAsDataURL(file);
  });
}

export async function uploadProfilePhoto(photo: Blob): Promise<StudentProfile> {
  const { profile } = await apiRequest<{ profile: StudentProfile }>("/api/profile/photo", {
    method: "PUT",
    body: { dataBase64: await toBase64(photo) },
    token: await accountToken()
  });
  return profile;
}

export async function removeProfilePhoto(): Promise<StudentProfile> {
  const { profile } = await apiRequest<{ profile: StudentProfile }>("/api/profile/photo", {
    method: "DELETE",
    token: await accountToken()
  });
  return profile;
}

/** `confirmEmail` is the account's email as the student typed it, which the API checks again. */
export async function deleteAccount(confirmEmail: string): Promise<void> {
  await apiRequest<{ deleted: true }>("/api/profile", {
    method: "DELETE",
    body: { confirmEmail },
    token: await accountToken()
  });
}
