/**
 * Which links a question's picture may be saved with.
 *
 * The link is put in front of every student who gets the question and, for a
 * written answer, fetched for the AI marker. Any text used to be taken: a file
 * name ("diagram1.png") showed students a broken picture and left written
 * answers on the question unmarked, and "javascript:alert(1)" or an address
 * inside the server's network were saved just the same.
 *
 * A picture link is one of:
 *
 * - a full https:// link, to a picture anywhere on the web;
 * - any link into the project's own Supabase storage, which is where the admin
 *   form puts every upload, whatever its scheme (the local stand-in is http);
 * - with no Supabase storage connected, a PNG, JPG or WebP kept in the question
 *   itself (a data: link), which is what the upload gives back then.
 *
 * A link is saved as it is read, written out in full, not as it was typed.
 * The parser takes "https:example.com/a.png", "HTTPS://Example.com/a.png" and
 * "https:\\example.com\a.png" all to mean https://example.com/a.png. Saved as
 * typed, the first passed the check, but a page served over https reads it as
 * a path on its own site: students saw a broken picture while the marker
 * fetched the real one. Written out in full, the link that is saved is the one
 * that is shown and the one that is fetched.
 *
 * Nothing here reads the environment, so tests can say which project there is.
 */

export interface PictureLinkRules {
  /** The Supabase project's origin ("https://abc.supabase.co"), or null without one. */
  supabaseOrigin: string | null;
  /** Whether a picture kept in the question (data:) is taken: only while no storage is connected. */
  allowInlinePictures: boolean;
}

/** The rules with no project in view: https:// links only. */
export const httpsPicturesOnly: PictureLinkRules = { supabaseOrigin: null, allowInlinePictures: false };

/** Why a link cannot be a question's picture, for the caller to word for its reader. */
export type PictureLinkProblem =
  /** Not a full https:// link, nor one into the project's storage. */
  | "not-https"
  /** A picture kept in the question while Supabase storage is connected. */
  | "inline-with-storage";

/** A picture kept in the question, as the upload gives one without storage. */
const INLINE_PICTURE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * The origin of a configured URL, or null when it is missing or has none
 * worth matching: a data: or file: URL's origin is the string "null", which
 * every other data: link shares.
 */
export function originOf(link: string | undefined | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** A picture link as it is saved, or what is wrong with it. */
export type PictureLinkCheck = { link: string } | { problem: PictureLinkProblem };

/** Checks a picture link, and gives it back written out in full for saving. */
export function checkPictureLink(link: string, rules: PictureLinkRules): PictureLinkCheck {
  // Already in its one written form: the pattern allows nothing else.
  if (INLINE_PICTURE.test(link)) return rules.allowInlinePictures ? { link } : { problem: "inline-with-storage" };

  let url: URL;
  try {
    url = new URL(link);
  } catch {
    // Not a link at all: a file name, a sentence, a stray value from another column.
    return { problem: "not-https" };
  }

  if (url.origin === rules.supabaseOrigin) return { link: url.href };
  if (url.protocol === "https:" && url.hostname.length > 0) return { link: url.href };
  return { problem: "not-https" };
}

/** A link short enough to quote in a message: a picture kept inline can be megabytes long. */
export function quotedLink(link: string): string {
  return link.length > 60 ? `${link.slice(0, 57)}...` : link;
}
