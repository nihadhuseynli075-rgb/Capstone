import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Difficulty,
  FriendPerson,
  StudentTest,
  StudentTestDraft,
  StudentTestItem,
  StudentTestSummary,
  TestVisibility
} from "@grade9/shared";
import { isUuid } from "../lib/ids";
import { PublicError } from "../lib/publicError";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { peopleById } from "./friendRepository";

/**
 * Tests students made themselves, kept in `student_tests` (migration 0020).
 *
 * There is no in-memory version, as there is none for friends: a test belongs
 * to an account, and without Supabase there are none. The routes refuse
 * before reaching here.
 *
 * Who may see which test is the route's to decide (see canSeeTest); every
 * write here is matched on the owner as well as the id, so a request naming
 * somebody else's test changes nothing.
 */

function client(): SupabaseClient {
  if (!supabaseAdmin) throw new Error("Student tests need the API connected to Supabase.");
  return supabaseAdmin;
}

/** A failure worded for whoever has to fix it, naming run-all.sql when the table is missing. */
function testsError(action: string, error: { code?: string; message: string }): Error {
  const missing = ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "");
  const hint = missing
    ? " Part of the database is missing: run supabase/run-all.sql (or migration 0020) in the Supabase SQL editor."
    : "";
  return new PublicError(`Failed to ${action}.${hint}`, error.message);
}

const COLUMNS = "id, owner_id, title, subject_id, difficulty, visibility, time_limit_minutes, items, created_at, updated_at";

function toTest(row: Record<string, unknown>): StudentTest {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    title: row.title as string,
    subjectId: row.subject_id as string,
    difficulty: row.difficulty as Difficulty,
    visibility: row.visibility as TestVisibility,
    timeLimitMinutes: (row.time_limit_minutes ?? null) as number | null,
    items: Array.isArray(row.items) ? (row.items as StudentTestItem[]) : [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}

function toRow(draft: StudentTestDraft) {
  return {
    title: draft.title,
    subject_id: draft.subjectId,
    difficulty: draft.difficulty,
    visibility: draft.visibility,
    time_limit_minutes: draft.timeLimitMinutes,
    items: draft.items
  };
}

/** Tests as a list shows them, with their authors; a test whose author cannot be shown is left out. */
async function summarise(tests: StudentTest[]): Promise<StudentTestSummary[]> {
  const people = await peopleById([...new Set(tests.map((test) => test.ownerId))]);
  return tests.flatMap((test) => {
    const author = people.get(test.ownerId);
    return author ? [summaryOf(test, author)] : [];
  });
}

export function summaryOf(test: StudentTest, author: FriendPerson): StudentTestSummary {
  return {
    id: test.id,
    title: test.title,
    subjectId: test.subjectId,
    difficulty: test.difficulty,
    visibility: test.visibility,
    timeLimitMinutes: test.timeLimitMinutes,
    questionCount: test.items.length,
    createdAt: test.createdAt,
    author
  };
}

export async function getTest(id: string): Promise<StudentTest | null> {
  // A mangled link is a test that does not exist, not a database error.
  if (!isUuid(id)) return null;
  const { data, error } = await client().from("student_tests").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw testsError("load that test", error);
  return data ? toTest(data) : null;
}

/** The owner's own tests, newest first, questions and all, for editing. */
export async function listOwnTests(ownerId: string): Promise<StudentTest[]> {
  const { data, error } = await client()
    .from("student_tests")
    .select(COLUMNS)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw testsError("load your tests", error);
  return (data ?? []).map(toTest);
}

/** One person's tests as `viewer` may see them: all of them for a friend, public ones otherwise. */
export async function listTestsBy(ownerId: string, everything: boolean): Promise<StudentTestSummary[]> {
  if (!isUuid(ownerId)) return [];
  let query = client().from("student_tests").select(COLUMNS).eq("owner_id", ownerId);
  if (!everything) query = query.eq("visibility", "public");
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw testsError("load their tests", error);
  return summarise((data ?? []).map(toTest));
}

/** The tests published for everyone, newest first. */
export async function listPublicTests(limit = 50): Promise<StudentTestSummary[]> {
  const { data, error } = await client()
    .from("student_tests")
    .select(COLUMNS)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw testsError("load the published tests", error);
  return summarise((data ?? []).map(toTest));
}

export async function countOwnTests(ownerId: string): Promise<number> {
  const { count, error } = await client()
    .from("student_tests")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  if (error) throw testsError("count your tests", error);
  return count ?? 0;
}

export async function createTest(ownerId: string, draft: StudentTestDraft): Promise<StudentTest> {
  const { data, error } = await client()
    .from("student_tests")
    .insert({ owner_id: ownerId, ...toRow(draft) })
    .select(COLUMNS)
    .single();
  if (error) throw testsError("save the test", error);
  return toTest(data);
}

/** Null when the owner has no test with that id (never theirs, or deleted). */
export async function updateTest(ownerId: string, id: string, draft: StudentTestDraft): Promise<StudentTest | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await client()
    .from("student_tests")
    .update(toRow(draft))
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw testsError("save the test", error);
  return data ? toTest(data) : null;
}

export async function deleteTest(ownerId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { data, error } = await client()
    .from("student_tests")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw testsError("delete the test", error);
  return (data ?? []).length > 0;
}

/** The admin taking a published test back to friends only, after a report. Null when it is gone. */
export async function setVisibility(id: string, visibility: TestVisibility): Promise<StudentTest | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await client()
    .from("student_tests")
    .update({ visibility })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw testsError("change who can see the test", error);
  return data ? toTest(data) : null;
}

/** Titles and visibility of these tests, for the reports list. */
export async function testsById(ids: string[]): Promise<Map<string, StudentTest>> {
  const found = new Map<string, StudentTest>();
  const valid = ids.filter(isUuid);
  if (valid.length === 0 || !supabaseAdmin) return found;
  const { data, error } = await client().from("student_tests").select(COLUMNS).in("id", valid);
  if (error) throw testsError("load the reported tests", error);
  for (const row of data ?? []) found.set(row.id as string, toTest(row));
  return found;
}
