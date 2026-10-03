import { normalizeUsername, usernameProblem, type UsernameProblem } from "@grade9/shared";

/**
 * What the API says about a username that cannot be used.
 *
 * The rules themselves are in @grade9/shared, so the profile form and the API
 * cannot disagree about them. What is here is the API's side of refusing: the
 * sentence, the code the browser picks its own-language sentence by, and
 * recognising the database's "that name is taken".
 */

const PROBLEM_MESSAGES: Record<UsernameProblem, string> = {
  empty: "Enter a username.",
  "too-short": "A username needs at least 3 characters.",
  "too-long": "A username can have at most 20 characters.",
  "bad-start": "A username must start with a letter.",
  "bad-characters": "Use only the letters a-z, numbers, underscores and dots.",
  reserved: "That username is reserved. Choose another."
};

export const USERNAME_TAKEN_MESSAGE = "That username is taken.";

/** A refusal, ready to be sent: status, code, the English sentence and what exactly was wrong. */
export interface UsernameRefusal {
  status: number;
  code: "username-invalid" | "username-reserved" | "username-taken";
  message: string;
  problem?: UsernameProblem;
}

export function refusalFor(problem: UsernameProblem): UsernameRefusal {
  return {
    status: 400,
    code: problem === "reserved" ? "username-reserved" : "username-invalid",
    message: PROBLEM_MESSAGES[problem],
    problem
  };
}

export const takenRefusal: UsernameRefusal = {
  status: 409,
  code: "username-taken",
  message: USERNAME_TAKEN_MESSAGE
};

/**
 * Checks a username from a request, and gives back the form it is saved in.
 *
 * This is everything that can be said without asking the database. Whether
 * somebody has the name already is only known by trying to save it.
 */
export function checkUsername(input: string): { ok: true; username: string } | { ok: false; refusal: UsernameRefusal } {
  const problem = usernameProblem(input);
  if (problem) return { ok: false, refusal: refusalFor(problem) };

  return { ok: true, username: normalizeUsername(input) };
}

/**
 * Whether a database error is the unique index on usernames saying the name is
 * taken, as opposed to any other uniqueness (the profile's own id) or failure.
 *
 * Postgres reports the index by name in the message and the column in the
 * detail ("Key (username)=(nihad) already exists."), and the name could
 * change where the column will not, so either is enough.
 */
export function isUsernameConflict(error: { code?: string; message?: string; details?: string | null }): boolean {
  if (error.code !== "23505") return false;
  return /username/i.test(`${error.message ?? ""} ${error.details ?? ""}`);
}
