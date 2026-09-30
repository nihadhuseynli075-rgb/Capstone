import { randomUUID } from "node:crypto";
import { env } from "../lib/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";

/**
 * Profile photos in Supabase storage.
 *
 * Each account's photos sit in a folder named after its id, and every upload
 * gets a new file name. A new name means a new URL, so a browser that cached
 * the old photo cannot keep showing it, and the folder is what lets every
 * photo an account ever had be found and deleted with it.
 */

export interface PhotoType {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * What a file really is, read from its first bytes.
 *
 * The file name and the type the browser claims are both whatever the sender
 * chose to say. The bucket is public, so anything stored in it is served to
 * whoever asks: an SVG or an HTML page sent in with an image type would be
 * served as a page that can run script. Only these three are let through.
 */
export function photoTypeOf(bytes: Buffer): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }

  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return { contentType: "image/png", extension: "png" };
  }

  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }

  return null;
}

function bucket() {
  if (!supabaseAdmin) throw new Error("Profile photos need the API connected to Supabase.");
  return supabaseAdmin.storage.from(env.avatarBucket);
}

/** Worded for whoever has to fix it: a missing bucket means 0007 has not been run. */
function storageError(action: string, message: string): Error {
  const hint = /bucket not found/i.test(message)
    ? " Run supabase/migrations/0007_profiles_and_google.sql to create the avatars bucket."
    : "";
  return new Error(`Failed to ${action}: ${message}.${hint}`);
}

/** Stores a photo in the account's folder and returns where it is served from. */
export async function storePhoto(
  accountId: string,
  bytes: Buffer,
  type: PhotoType
): Promise<{ path: string; url: string }> {
  const path = `${accountId}/${randomUUID()}.${type.extension}`;

  const { error } = await bucket().upload(path, bytes, {
    contentType: type.contentType,
    // The file under this name never changes, so browsers may keep it a year.
    cacheControl: "31536000",
    upsert: false
  });

  if (error) throw storageError("upload your photo", error.message);

  return { path, url: bucket().getPublicUrl(path).data.publicUrl };
}

/**
 * The file a stored photo's address points at, or null when it is not one of
 * this account's.
 *
 * Deleting by the address on the profile, rather than by sweeping the folder,
 * is what lets two tabs change the photo at once without deleting each other's
 * file. A Google photo's address is not ours and yields null, so a student who
 * signed up with Google and then uploaded their own has nothing deleted that
 * this app never stored.
 */
export function storedPhotoPath(accountId: string, url: string | null): string | null {
  if (!url) return null;

  const marker = `/storage/v1/object/public/${env.avatarBucket}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;

  const [folder, file, ...rest] = url.slice(at + marker.length).split("?")[0].split("/");
  // Every photo is one file directly inside the folder named after the account.
  if (folder !== accountId || !file || rest.length > 0) return null;

  return `${accountId}/${decodeURIComponent(file)}`;
}

/** Deletes one stored photo. Deleting one that is already gone is not a failure. */
export async function removePhotoAt(path: string): Promise<void> {
  const { error } = await bucket().remove([path]);
  if (error) throw storageError("delete your photo", error.message);
}

const LIST_PAGE = 100;

/** A bound on the loop below, far beyond what one account could upload, so it can never spin. */
const MAX_PAGES = 50;

/**
 * Deletes every photo in an account's folder.
 *
 * Only for an account being deleted, where sweeping the folder is the point:
 * it catches files left behind by an upload that failed halfway, so nothing
 * of the student's is left in a public bucket.
 */
export async function removePhotos(accountId: string): Promise<void> {
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await bucket().list(accountId, { limit: LIST_PAGE });

    if (error) {
      // No bucket means no photos were ever stored, and an account must stay
      // deletable whatever state the storage settings are in.
      if (/bucket not found/i.test(error.message)) return;
      throw storageError("find your photos", error.message);
    }

    const doomed = (data ?? [])
      // Storage lists a folder inside the folder with no id. Photos are never
      // put in one, and a folder is not something that can be deleted by name.
      .filter((item) => item.id !== null)
      .map((item) => `${accountId}/${item.name}`);

    if (doomed.length === 0) return;

    const { error: removeError } = await bucket().remove(doomed);
    if (removeError) throw storageError("delete your photos", removeError.message);
  }
}
