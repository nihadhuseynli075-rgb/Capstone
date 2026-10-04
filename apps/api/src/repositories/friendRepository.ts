import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DifficultyMode,
  Friend,
  FriendPerson,
  FriendProgress,
  FriendRequest,
  FriendsOverview,
  SentFriendRequest
} from "@grade9/shared";
import { cleanName, isReadableName } from "@grade9/shared";
import { isUuid } from "../lib/ids";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import {
  otherEnd,
  planRequest,
  sortFriendships,
  summariseProgress,
  type FriendLookup,
  type FriendshipRow,
  type SubmittedTest
} from "../services/friends";

/**
 * Friends, kept in the `friendships` table from migration 0005.
 *
 * This reads that table directly rather than through the `friends_of` view. The
 * view is a flat pair of ids, made for joining the leaderboard against, and
 * this needs what it leaves out: the row's own id (to answer or remove it), who
 * asked whom, and when. Everything here acts for one signed-in student and is
 * given their account id by the route, never taken from the request.
 *
 * There is no in-memory version. Friendships point at accounts, and without
 * Supabase there are none; the friends routes refuse before reaching here.
 */

function client(): SupabaseClient {
  if (!supabaseAdmin) throw new Error("Friends need the API connected to Supabase.");
  return supabaseAdmin;
}

/**
 * A friends query's failure, worded for whoever has to fix it.
 *
 * The one to expect is `run-all.sql` not having been run since friends were
 * added to the app, which leaves no `friendships` table to ask, or since
 * usernames were, which leaves `profiles` without the column. Saying which
 * file fixes it is worth more than the raw message on its own.
 */
function friendsError(action: string, error: { code?: string; message: string }): Error {
  const missing = ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "");
  const hint = missing
    ? " Part of the database is missing: run supabase/run-all.sql in the Supabase SQL editor."
    : "";
  return new Error(`Failed to ${action}: ${error.message}.${hint}`);
}

const FRIENDSHIP_COLUMNS = "id, user_id, friend_id, status, created_at, responded_at";

function toRow(row: Record<string, unknown>): FriendshipRow {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    friendId: row.friend_id as string,
    status: row.status as FriendshipRow["status"],
    createdAt: row.created_at as string,
    respondedAt: (row.responded_at ?? null) as string | null
  };
}

/**
 * A filter for rows with this student at either end.
 *
 * It is written into the query text, so it is only ever given an account id
 * that came out of a verified token, and checked once more here.
 */
function involving(me: string): string {
  if (!isUuid(me)) throw new Error("Friends can only be read for a signed-in account.");
  return `user_id.eq.${me},friend_id.eq.${me}`;
}

async function rowsInvolving(me: string): Promise<FriendshipRow[]> {
  const { data, error } = await client()
    .from("friendships")
    .select(FRIENDSHIP_COLUMNS)
    .or(involving(me))
    .order("created_at", { ascending: false });

  if (error) throw friendsError("load your friends", error);
  return (data ?? []).map(toRow);
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

function toPerson(row: Record<string, unknown>): FriendPerson {
  // Cleaned as the profile page cleans a new name, so one saved before that,
  // made only of characters that draw nothing, does not show as a blank.
  const name = typeof row.full_name === "string" ? cleanName(row.full_name) : "";

  return {
    id: row.id as string,
    // Never the start of the email address as a stand-in: that would hand part
    // of it to somebody who was not given it. Every profile has a name, so this
    // only covers a row that has been edited by hand, or an unreadable one.
    fullName: isReadableName(name) ? name : "Exampeak student",
    username: typeof row.username === "string" ? row.username : "",
    avatarUrl: typeof row.avatar_url === "string" && row.avatar_url.length > 0 ? row.avatar_url : null
  };
}

const PERSON_COLUMNS = "id, full_name, username, avatar_url";

/**
 * The student with this email address or username, or null if there is none.
 *
 * Both are columns of `profiles`, and so one read each. The email has no index
 * of its own, which is fine while the table is a school's worth of students;
 * the username's is the one that keeps it unique. The email is kept in step
 * with the account by migration 0007's triggers; the
 * alternative is the auth admin API, which can list users but cannot find one
 * by email, so it would mean paging through every account on each request.
 * Supabase lowercases an address when it is saved, and the profile copies it
 * as it is, so an exact match on the lowercased address is a match on the
 * account's. Usernames are stored lowercase too, and unique.
 *
 * Only an id, a name, a username and a photo come back. Nothing returns the
 * address.
 */
export async function findPerson(lookup: FriendLookup): Promise<FriendPerson | null> {
  const query = client().from("profiles").select(PERSON_COLUMNS);
  const { data, error } = await (lookup.by === "email"
    ? query.eq("email", lookup.email)
    : query.eq("username", lookup.username)
  ).limit(1);

  if (error) throw friendsError("look that student up", error);
  return data && data.length > 0 ? toPerson(data[0]) : null;
}

async function peopleById(ids: string[]): Promise<Map<string, FriendPerson>> {
  const people = new Map<string, FriendPerson>();
  if (ids.length === 0) return people;

  const { data, error } = await client().from("profiles").select(PERSON_COLUMNS).in("id", ids);
  if (error) throw friendsError("load your friends' names", error);

  for (const row of data ?? []) people.set(row.id as string, toPerson(row));
  return people;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/** Rows asked for at a time. Supabase cuts any single read off at 1,000 by default. */
const PAGE_SIZE = 1000;

/**
 * Every submitted test for these students, grouped by student.
 *
 * Read the way the history page reads them, by `student_key`, so a friend's
 * figures are the tests that appear on their own history. A page is asked for
 * until the total is reached, as in questionRepository: a single read stops
 * without complaint at the project's row limit, which a few friends with a few
 * dozen tests each could reach.
 */
async function submittedTests(studentKeys: string[]): Promise<Map<string, SubmittedTest[]>> {
  const byStudent = new Map<string, SubmittedTest[]>();
  let total: number | null = null;
  let read = 0;

  while (total === null || read < total) {
    const { data, error, count } = await client()
      .from("test_attempts")
      .select("student_key, score, total_marks, total_questions, percentage, difficulty_mode, submitted_at", {
        count: "exact"
      })
      .in("student_key", studentKeys)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .order("id")
      .range(read, read + PAGE_SIZE - 1);

    if (error) throw friendsError("load your friends' progress", error);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const tests = byStudent.get(row.student_key as string) ?? [];
      tests.push({
        score: (row.score ?? 0) as number,
        // Tests recorded before marks existed were all one-mark questions, so
        // the question count is exactly the marks that were available.
        totalMarks: (row.total_marks ?? row.total_questions ?? 0) as number,
        totalQuestions: (row.total_questions ?? 0) as number,
        percentage: Number(row.percentage ?? 0),
        difficultyMode: row.difficulty_mode as DifficultyMode,
        submittedAt: row.submitted_at as string
      });
      byStudent.set(row.student_key as string, tests);
    }

    read += data.length;
    total = count ?? total;
  }

  return byStudent;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const NO_PROGRESS: FriendProgress = { testsTaken: 0, best: null, averagePercentage: null, lastActiveAt: null };

/** Friends, requests to answer and requests waiting, with each friend's progress beside this student's own. */
export async function getOverview(me: string): Promise<FriendsOverview> {
  const sorted = sortFriendships(await rowsInvolving(me), me);

  const ids = [...new Set([...sorted.friends, ...sorted.incoming, ...sorted.outgoing].map((row) => otherEnd(row, me)))];
  const [people, tests] = await Promise.all([
    peopleById(ids),
    // Always asks about this student too, so there is a figure to compare with
    // even before they have any friends to compare it with.
    submittedTests([me, ...sorted.friends.map((row) => otherEnd(row, me))])
  ]);

  // A person who is gone from `profiles` has no row left to point at them
  // either (the foreign key cascades), so this only guards a read in between.
  const known = <T extends FriendshipRow>(rows: T[]) => rows.filter((row) => people.has(otherEnd(row, me)));
  const person = (row: FriendshipRow) => people.get(otherEnd(row, me)) as FriendPerson;

  const friends: Friend[] = known(sorted.friends)
    .map((row) => ({
      ...person(row),
      friendshipId: row.id,
      since: row.respondedAt ?? row.createdAt,
      progress: summariseProgress(tests.get(otherEnd(row, me)) ?? [])
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const asRequest = (row: FriendshipRow): FriendRequest => ({
    ...person(row),
    requestId: row.id,
    sentAt: row.createdAt
  });

  return {
    me: tests.has(me) ? summariseProgress(tests.get(me) ?? []) : NO_PROGRESS,
    friends,
    // Newest first, which is the order the rows were read in.
    incoming: known(sorted.incoming).map(asRequest),
    outgoing: known(sorted.outgoing).map(asRequest)
  };
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

export type SendOutcome =
  | { sent: SentFriendRequest }
  | { refused: "yourself" | "no-account" | "already-friends" | "already-requested" | "blocked" };

/** Accepts a request addressed to `me`. Null when there is no such request waiting. */
async function acceptPending(me: string, requestId: string): Promise<string | null> {
  const { data, error } = await client()
    .from("friendships")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    // Only a request addressed to this student, and only while it is still
    // waiting: of two answers racing, exactly one matches the row.
    .eq("id", requestId)
    .eq("friend_id", me)
    .eq("status", "pending")
    .select("user_id");

  if (error) throw friendsError("accept the request", error);
  if (!data || data.length === 0) return null;

  const asker = data[0].user_id as string;

  // The table cannot stop two students asking each other at the same moment,
  // which leaves a second pending row the other way. It has nothing left to
  // say now, and failing to remove it only leaves a row sortFriendships hides.
  const { error: leftoverError } = await client()
    .from("friendships")
    .delete()
    .eq("user_id", me)
    .eq("friend_id", asker)
    .eq("status", "pending");

  if (leftoverError) {
    console.error(`[api] Could not remove the crossed request from ${me} to ${asker}: ${leftoverError.message}`);
  }

  return asker;
}

/**
 * Asks the student with this email address or username to be friends.
 *
 * Every edge of this is decided by planRequest; this only carries it out. The
 * unknown-account answer is a plain "no account": for an app of this size,
 * being told whether an address or a username is registered is a fair price
 * for not leaving a student typing into the void. It is signed-in students
 * only, and only ever returns a name, a username and a photo.
 */
export async function sendRequest(me: string, myEmail: string, lookup: FriendLookup): Promise<SendOutcome> {
  // Your own address is known without asking anyone. Your own username is only
  // known once it has been found, below.
  if (lookup.by === "email" && lookup.email === myEmail.trim().toLowerCase()) return { refused: "yourself" };

  const them = await findPerson(lookup);
  if (!them) return { refused: "no-account" };
  if (them.id === me) return { refused: "yourself" };

  const plan = planRequest(await rowsInvolving(me), me, them.id);

  if (plan.action === "refuse") return { refused: plan.reason };

  if (plan.action === "accept-theirs") {
    if ((await acceptPending(me, plan.theirs.id)) !== null) {
      return { sent: { outcome: "accepted", person: them } };
    }
    // They withdrew it between the read and the answer, so ask afresh.
  }

  const { error } = await client().from("friendships").insert({ user_id: me, friend_id: them.id });

  if (error) {
    // The same request sent twice at once: the table allows one per direction.
    if (error.code === "23505") return { refused: "already-requested" };
    // They deleted their account between the lookup and the insert.
    if (error.code === "23503") return { refused: "no-account" };
    throw friendsError("send the request", error);
  }

  return { sent: { outcome: "requested", person: them } };
}

// ---------------------------------------------------------------------------
// Answering and ending
// ---------------------------------------------------------------------------

/** Accepts a request someone sent `me`. Null when there is no such request waiting. */
export async function acceptRequest(me: string, requestId: string): Promise<FriendPerson | null> {
  const asker = await acceptPending(me, requestId);
  if (asker === null) return null;

  const person = (await peopleById([asker])).get(asker);
  return person ?? null;
}

/** Deletes a pending request, if it is `column`'s to delete. Returns whether one was there. */
async function deletePending(requestId: string, column: "friend_id" | "user_id", me: string, action: string) {
  const { data, error } = await client()
    .from("friendships")
    .delete()
    .eq("id", requestId)
    .eq(column, me)
    .eq("status", "pending")
    .select("id");

  if (error) throw friendsError(action, error);
  return (data ?? []).length > 0;
}

/**
 * Turns down a request someone sent `me`.
 *
 * The row is deleted rather than kept as declined, so the person who asked may
 * ask again later. The table has no "declined" status; its "blocked" one is for
 * when somebody should not be able to.
 */
export function declineRequest(me: string, requestId: string): Promise<boolean> {
  return deletePending(requestId, "friend_id", me, "decline the request");
}

/** Takes back a request `me` sent. */
export function cancelRequest(me: string, requestId: string): Promise<boolean> {
  return deletePending(requestId, "user_id", me, "cancel the request");
}

/** Ends a friendship, from either side. Returns whether there was one to end. */
export async function removeFriend(me: string, friendshipId: string): Promise<boolean> {
  const { data, error } = await client()
    .from("friendships")
    .delete()
    .eq("id", friendshipId)
    .eq("status", "accepted")
    .or(involving(me))
    .select("id");

  if (error) throw friendsError("remove the friend", error);
  return (data ?? []).length > 0;
}
