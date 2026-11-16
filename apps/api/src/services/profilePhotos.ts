import { randomUUID } from "node:crypto";
import { env } from "../lib/env";
import { PublicError } from "../lib/publicError";
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
 * chose to say. A stored file is served as it is to whoever opens its link:
 * an SVG or an HTML page sent in with an image type would be served as a page
 * that can run script. Only these three are let through.
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

/**
 * Worded for whoever has to fix it: a missing bucket means 0007 has not been
 * run. The storage server's own words are kept for the log only.
 */
function storageError(action: string, message: string): Error {
  const hint = /bucket not found/i.test(message)
    ? " Run supabase/migrations/0007_profiles_and_google.sql to create the avatars bucket."
    : "";
  return new PublicError(`Failed to ${action}.${hint}`, message);
}

/**
 * Stores a photo in the account's folder. Returns its path, and the address
 * the profile keeps for it: the bucket's public one, which signedPhotoUrls
 * turns into a link that opens it.
 */
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
 * How long a link to a profile photo opens it, in seconds.
 *
 * Students' photos are kept in a private bucket (migration 0018), so nobody
 * can open one from an address that was copied, cached or passed on: the API
 * signs a fresh link each time it sends a profile or a friends list, and the
 * link stops working after this. An hour covers a page left open through a
 * lesson. After it, the photo falls back to initials (Avatar in the web app)
 * until the page asks for the profile again.
 */
export const PHOTO_LINK_SECONDS = 60 * 60;

/**
 * The file in the photo bucket a stored address points at, as a path inside
 * the bucket, or null for any other address (a Google photo, say).
 *
 * Profiles keep the address the upload was given, which is the bucket's public
 * one, so the photos stored before the bucket went private are found the same
 * way as new ones. Only a file directly inside an account's folder counts,
 * which is the only place an upload is ever put.
 */
function photoPathOf(url: string): string | null {
  const marker = `/storage/v1/object/public/${env.avatarBucket}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;

  const [folder, file, ...rest] = url.slice(at + marker.length).split("?")[0].split("/");
  if (!folder || !file || rest.length > 0) return null;

  return `${folder}/${decodeURIComponent(file)}`;
}

/**
 * Stored photo addresses as links a browser can open, in the same order.
 *
 * Each of this app's photos becomes a link signed for PHOTO_LINK_SECONDS; a
 * Google photo's address, and no photo, pass through unchanged. All of one
 * answer's photos are signed in one request.
 *
 * Signing works on a public bucket as well as a private one, so this is right
 * both before and after 0018 is run. If signing fails, the stored addresses go
 * out as they are: they still open while the bucket is public, and once it is
 * private a photo that cannot be opened shows as initials, which is better than
 * failing the profile or the friends list it is part of.
 */
export async function signedPhotoUrls(urls: Array<string | null>): Promise<Array<string | null>> {
  const paths = urls.map((url) => (url ? photoPathOf(url) : null));
  const wanted = [...new Set(paths.filter((path): path is string => path !== null))];
  if (wanted.length === 0 || !supabaseAdmin) return urls;

  try {
    const { data, error } = await bucket().createSignedUrls(wanted, PHOTO_LINK_SECONDS);
    if (error) throw error;

    const signed = new Map<string, string>();
    for (const item of data ?? []) {
      if (item.path && item.signedUrl && !item.error) signed.set(item.path, item.signedUrl);
    }

    return urls.map((url, index) => {
      const path = paths[index];
      return path === null ? url : (signed.get(path) ?? url);
    });
  } catch (error) {
    console.error(`[api] Could not sign profile photo links: ${(error as Error).message}`);
    return urls;
  }
}

/** A profile or a person, with its photo as a link the browser can open (see signedPhotoUrls). */
export async function withSignedPhoto<T extends { avatarUrl: string | null }>(item: T): Promise<T> {
  const [avatarUrl] = await signedPhotoUrls([item.avatarUrl]);
  return avatarUrl === item.avatarUrl ? item : { ...item, avatarUrl };
}

/** As withSignedPhoto, for a list, signed in one request. */
export async function withSignedPhotos<T extends { avatarUrl: string | null }>(items: T[]): Promise<T[]> {
  const signed = await signedPhotoUrls(items.map((item) => item.avatarUrl));
  return items.map((item, index) => (signed[index] === item.avatarUrl ? item : { ...item, avatarUrl: signed[index] }));
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

/**
 * Whether an account has any photo stored in its folder. No bucket means no
 * photo was ever stored there.
 */
export async function hasPhotos(accountId: string): Promise<boolean> {
  const { data, error } = await bucket().list(accountId, { limit: 100 });

  if (error) {
    if (/bucket not found/i.test(error.message)) return false;
    throw storageError("find your photos", error.message);
  }

  // Storage lists a folder inside the folder with no id; photos are files.
  return (data ?? []).some((item) => item.id !== null);
}

const LIST_PAGE = 100;

/** A bound on the loop below, far beyond what one account could upload, so it can never spin. */
const MAX_PAGES = 50;

/**
 * Deletes every photo in an account's folder.
 *
 * Only for an account being deleted, where sweeping the folder is the point:
 * it catches files left behind by an upload that failed halfway, so nothing
 * of the student's is left in the bucket.
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
