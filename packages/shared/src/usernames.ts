/**
 * Usernames: what a student is found by, so that friends do not need to know
 * an email address.
 *
 * Shared because three places must agree on the rules: the profile form
 * (to answer while the student is still typing), the API (the real check, since
 * a request does not have to come from the form) and the database (the last
 * check, in migration 0012). The SQL in that migration repeats the pattern and
 * the reserved list below; change them together.
 *
 * A username is stored lowercase. Because it is, the unique index on it is
 * also a case-insensitive one: "Nihad" and "nihad" are the same name.
 */

export const usernameLimits = {
  min: 3,
  max: 20
} as const;

/**
 * The shape of a stored username: starts with a letter, then letters, digits,
 * underscores or dots, 3 to 20 characters in all.
 *
 * Written as the same regular expression the database checks, so there is one
 * rule rather than a description of it.
 */
export const usernamePattern = /^[a-z][a-z0-9_.]{2,19}$/;

/**
 * Names that would pass for the site itself or for somebody who runs it.
 *
 * Compared with dots and underscores taken out, so "ad.min" and "exam_peak"
 * are no way round it. All lowercase, since that is how names are compared.
 */
export const reservedUsernames: readonly string[] = [
  "abuse",
  "admin",
  "administrator",
  "anonymous",
  "api",
  "contact",
  "deleted",
  "dim",
  "exampeak",
  "friends",
  "help",
  "helpdesk",
  "info",
  "login",
  "moderator",
  "mod",
  "noreply",
  "null",
  "official",
  "owner",
  "postmaster",
  "profile",
  "register",
  "root",
  "security",
  "settings",
  "signin",
  "signup",
  "staff",
  "support",
  "sysadmin",
  "system",
  "team",
  "undefined",
  "unknown",
  "webmaster",
  "www"
];

const reservedFlat = new Set(reservedUsernames.map((name) => name.replace(/[._]/g, "")));

/**
 * Why a username cannot be used. A name is only ever refused for the first of
 * these that applies, in this order, which is the order a person would fix them.
 */
export type UsernameProblem =
  | "empty"
  | "too-short"
  | "too-long"
  | "bad-characters"
  | "bad-start"
  | "reserved";

/** Letters the Azerbaijani and Turkish alphabets have that no accent mark takes apart. */
const FOLDED_LETTERS: Record<string, string> = { ə: "e", ı: "i" };

/**
 * A username as typed, brought to the form it is stored and looked up in.
 *
 * Surrounding spaces and one leading "@" go, since the page writes usernames
 * as "@name" and friends will type them that way. Case goes. Accents are
 * folded onto the plain letter, so "Hüseyn" is "huseyn" and a student with the
 * Azerbaijani "İ" or "ə" in their name is not told that the letter is wrong.
 * Anything that still is not a-z, 0-9, "_" or "." is left in for
 * `usernameProblem` to refuse; this never throws a character away silently
 * beyond those.
 */
export function normalizeUsername(input: string): string {
  const unaccented = input
    .normalize("NFKC")
    .trim()
    .replace(/^@/, "")
    // Before lowercasing: "İ" lowercases to an "i" plus a loose dot, which
    // would otherwise be refused as a strange character.
    .replace(/İ/g, "I")
    .toLowerCase()
    .replace(/[əı]/g, (letter) => FOLDED_LETTERS[letter])
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  return unaccented.normalize("NFC");
}

/** Whether a normalised username is on the reserved list. */
export function isReservedUsername(normalized: string): boolean {
  return reservedFlat.has(normalized.replace(/[._]/g, ""));
}

/**
 * What is wrong with a username, or null when it can be used.
 *
 * Takes the name as typed and normalises it first, so every caller gets the
 * same answer for "@Nihad " as for "nihad". Whether somebody else already has
 * the name is not something it can know: only the database can say that.
 */
export function usernameProblem(input: string): UsernameProblem | null {
  const username = normalizeUsername(input);

  if (username.length === 0) return "empty";
  if (username.length < usernameLimits.min) return "too-short";
  if (username.length > usernameLimits.max) return "too-long";
  // Characters before the start: a name that opens with a Cyrillic letter is
  // told to use a-z, not that it "must start with a letter" when it does.
  if (!/^[a-z0-9_.]+$/.test(username)) return "bad-characters";
  if (!/^[a-z]/.test(username)) return "bad-start";
  if (isReservedUsername(username)) return "reserved";

  return null;
}
