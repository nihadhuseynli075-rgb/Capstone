import { attemptScoreValue, normalizeUsername, type DifficultyMode, type FriendProgress } from "@grade9/shared";

/**
 * The rules of friend requests, apart from the database.
 *
 * A row in `friendships` is directional - who asked whom - while a friendship
 * is not, and the table's constraints only stop the same direction being stored
 * twice. Everything that depends on reading both directions together lives
 * here as plain functions, so it can be tested without a database and the
 * repository only has to do what it is told.
 */

export interface FriendshipRow {
  id: string;
  /** Who asked. */
  userId: string;
  /** Who was asked. */
  friendId: string;
  status: "pending" | "accepted" | "blocked";
  createdAt: string;
  respondedAt: string | null;
}

/** The student at the other end of a row, from `me`'s side of it. */
export function otherEnd(row: FriendshipRow, me: string): string {
  return row.userId === me ? row.friendId : row.userId;
}

export type FriendLookup = { by: "email"; email: string } | { by: "username"; username: string };

/** Something, then an "@", then a domain with a dot in it. Nothing before the "@" means a username. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What the add-friend box was given: an email address or a username.
 *
 * The test for an email needs something in front of the "@", and that is what
 * keeps "@aysel.k" a username. Usernames may contain dots, so "@aysel.k" has an
 * "@" followed by something that looks like a domain, but an address cannot
 * start with an "@". A username is typed with or without one leading "@", as
 * it is printed.
 *
 * A username goes through the same normalizeUsername the profile page saves
 * it with, so every spelling the profile page counts as the same name finds
 * it here too: "İlkin" and "ilkin", "əliyev" and "eliyev", accents, and the
 * full-width letters and "＠" some phone keyboards type. Lowercasing alone
 * found none of those, while the profile page said the name was taken.
 *
 * This does not hold a username to the shape the profile page enforces. A
 * name that cannot exist is simply not found, and a rule changed over there
 * does not need changing here. Null is for text that cannot be either.
 */
export function parseLookup(input: string): FriendLookup | null {
  // Full-width forms first, so a "＠" or a full-width letter reads as the plain one.
  const text = input.normalize("NFKC").trim();
  const lower = text.toLowerCase();
  if (EMAIL_SHAPE.test(lower)) return { by: "email", email: lower };

  const username = normalizeUsername(text);
  if (username.length === 0 || username.length > 254 || /\s/.test(username)) return null;

  return { by: "username", username };
}

export type RequestPlan =
  | { action: "create" }
  /** They already asked me, so their request is the one to accept. */
  | { action: "accept-theirs"; theirs: FriendshipRow }
  | { action: "refuse"; reason: "already-friends" | "already-requested" | "blocked" };

/**
 * What to do when `me` asks `them`, given every row there already is between
 * the two of them, in either direction.
 *
 * Asking someone who has already asked you is the one case that is not a
 * refusal: a second row would leave two pending requests pointing at each
 * other, and both people wanting exactly the same thing. Accepting theirs ends
 * it in one step.
 */
export function planRequest(between: FriendshipRow[], me: string, them: string): RequestPlan {
  const rows = between.filter((row) => otherEnd(row, me) === them);

  // Nothing here makes a blocked row, but the status exists and the page has
  // to cope with one. Neither side can start again over it, and neither is
  // told which side did the blocking.
  if (rows.some((row) => row.status === "blocked")) return { action: "refuse", reason: "blocked" };

  if (rows.some((row) => row.status === "accepted")) return { action: "refuse", reason: "already-friends" };

  if (rows.some((row) => row.status === "pending" && row.userId === me)) {
    return { action: "refuse", reason: "already-requested" };
  }

  const theirs = rows.find((row) => row.status === "pending" && row.userId === them);
  return theirs ? { action: "accept-theirs", theirs } : { action: "create" };
}

export interface SortedFriendships {
  friends: FriendshipRow[];
  incoming: FriendshipRow[];
  outgoing: FriendshipRow[];
}

/**
 * Every row that involves `me`, sorted into friends, requests to answer and
 * requests waiting.
 *
 * One person appears at most once, whatever the rows say. The table cannot
 * rule out two students asking each other in the same instant, which leaves a
 * pending row each way; that pair is shown as the one request to answer, and
 * accepting it clears the other (see acceptRequest). Likewise a request that
 * is still pending beside an accepted row is only a leftover and is hidden.
 */
export function sortFriendships(rows: FriendshipRow[], me: string): SortedFriendships {
  const friends = new Map<string, FriendshipRow>();
  const incoming = new Map<string, FriendshipRow>();
  const outgoing = new Map<string, FriendshipRow>();

  for (const row of rows) {
    if (row.status === "accepted" && !friends.has(otherEnd(row, me))) friends.set(otherEnd(row, me), row);
  }

  for (const row of rows) {
    const other = otherEnd(row, me);
    if (row.status !== "pending" || friends.has(other)) continue;

    if (row.friendId === me) {
      if (!incoming.has(other)) incoming.set(other, row);
    } else if (!outgoing.has(other)) {
      outgoing.set(other, row);
    }
  }

  for (const other of incoming.keys()) outgoing.delete(other);

  return {
    friends: [...friends.values()],
    incoming: [...incoming.values()],
    outgoing: [...outgoing.values()]
  };
}

/** A submitted test, as far as comparing progress needs to know it. */
export interface SubmittedTest {
  score: number;
  totalMarks: number;
  totalQuestions: number;
  percentage: number;
  difficultyMode: DifficultyMode;
  submittedAt: string;
}

/**
 * The headline figures for one student's submitted tests.
 *
 * "Best" is the same test the history page highlights, weighted for difficulty
 * and length, so a student sees the same best test on both pages. When two tie
 * the newer one wins, as it does there, because that page lists newest first.
 */
export function summariseProgress(tests: SubmittedTest[]): FriendProgress {
  if (tests.length === 0) return { testsTaken: 0, best: null, averagePercentage: null, lastActiveAt: null };

  // Compared as times, not as text, so the order does not depend on how
  // Postgres happened to format each one (with a fraction of a second or not).
  const newestFirst = [...tests].sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
  const best = newestFirst.reduce((leader, test) => (attemptScoreValue(test) > attemptScoreValue(leader) ? test : leader));
  const mean = newestFirst.reduce((sum, test) => sum + test.percentage, 0) / newestFirst.length;

  return {
    testsTaken: newestFirst.length,
    best: { score: best.score, totalMarks: best.totalMarks, percentage: best.percentage },
    averagePercentage: Math.round(mean * 10) / 10,
    lastActiveAt: newestFirst[0].submittedAt
  };
}
