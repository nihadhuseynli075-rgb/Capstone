import { randomUUID } from "node:crypto";
import type { BankQuestion, Difficulty, QuestionDraft, QuestionStatus, QuestionType } from "@grade9/shared";
import { isUuid } from "../lib/ids";
import { containsPattern, containsText, needsTextCheck } from "../lib/likePattern";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { statusAfterSave } from "../services/questionStatus";
import { readTranslations } from "../services/questionTranslations";

export interface QuestionFilter {
  subjectId?: string;
  topicIds?: string[];
  difficulty?: Difficulty;
  search?: string;
  /**
   * Leave out questions that are not ready: anything a student could be given.
   * The admin list is the one reader that wants the unfinished ones too.
   */
  readyOnly?: boolean;
  /** Types to leave out, e.g. written questions while there is no marker. */
  excludeTypes?: QuestionType[];
}

/** Shape of a row in the `questions` table. */
interface QuestionRow {
  id: string;
  subject_id: string;
  topic_id: string;
  difficulty: string;
  type: string;
  prompt: string;
  options: unknown;
  correct_answer: string;
  marks: number | null;
  explanation: string | null;
  image_url: string | null;
  paper_year: number | null;
  source: string | null;
  status: string | null;
  subtopic: string | null;
  translations: unknown;
  created_at: string;
  updated_at: string;
}

function toQuestion(row: QuestionRow): BankQuestion {
  return {
    id: row.id,
    subjectId: row.subject_id,
    topicId: row.topic_id,
    difficulty: row.difficulty as Difficulty,
    type: row.type as BankQuestion["type"],
    prompt: row.prompt,
    options: Array.isArray(row.options) ? (row.options as string[]) : [],
    correctAnswer: row.correct_answer,
    // Rows entered before marks existed read back as one-mark questions.
    marks: row.marks ?? 1,
    explanation: row.explanation ?? "",
    imageUrl: row.image_url,
    paperYear: row.paper_year,
    source: row.source,
    // A database from before 0008 has no status column, and everything in it
    // was being served, so it all reads as ready.
    status: (row.status ?? "ready") as QuestionStatus,
    subtopic: row.subtopic ?? null,
    // A database from before 0010 has no such column, and no translations.
    translations: readTranslations(row.translations),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toRow(draft: QuestionDraft, status: QuestionStatus = "ready") {
  return {
    subject_id: draft.subjectId,
    topic_id: draft.topicId,
    difficulty: draft.difficulty,
    type: draft.type,
    prompt: draft.prompt,
    options: draft.options,
    correct_answer: draft.correctAnswer,
    marks: draft.marks,
    explanation: draft.explanation,
    image_url: draft.imageUrl,
    paper_year: draft.paperYear,
    source: draft.source,
    translations: draft.translations,
    // Only ever written from the admin form or an import, both of which check
    // the question is complete first, so it is ready unless it is still
    // waiting for its picture (see statusAfterSave).
    status
  };
}

/**
 * In-memory question store.
 *
 * Used only when Supabase credentials are absent, so the app can be run and
 * demonstrated before the database is connected. Contents are lost on restart.
 */
const memoryQuestions = new Map<string, BankQuestion>();

function matchesFilter(question: BankQuestion, filter: QuestionFilter): boolean {
  if (filter.subjectId && question.subjectId !== filter.subjectId) return false;
  if (filter.topicIds?.length && !filter.topicIds.includes(question.topicId)) return false;
  if (filter.difficulty && question.difficulty !== filter.difficulty) return false;
  if (filter.readyOnly && question.status !== "ready") return false;
  if (filter.excludeTypes?.includes(question.type)) return false;
  if (filter.search && !containsText(question.prompt, filter.search)) return false;
  return true;
}

/** Rows asked for at a time. Supabase cuts any single read off at 1,000 by default. */
const PAGE_SIZE = 1000;

interface Page {
  data: unknown[] | null;
  error: { message: string } | null;
  count: number | null;
}

/**
 * Every row a query matches, a page at a time.
 *
 * A single read stops without complaint at the project's row limit, 1,000 by
 * default, so a bank bigger than that quietly lost questions: from the admin
 * list, from the pool tests are drawn from, and from the catalog's counts. Each
 * page carries the total, so a small bank still costs one request. A page
 * shorter than asked for is not taken as the end, since the project's limit
 * could be below the page size.
 */
async function readAllPages(
  readPage: (from: number, to: number) => PromiseLike<Page>,
  task: string
): Promise<unknown[]> {
  const rows: unknown[] = [];
  let total: number | null = null;

  while (total === null || rows.length < total) {
    const { data, error, count } = await readPage(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to ${task}: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...data);
    total = count ?? total;
  }

  return rows;
}

export async function listQuestions(filter: QuestionFilter = {}): Promise<BankQuestion[]> {
  if (!supabaseAdmin) {
    return [...memoryQuestions.values()]
      .filter((question) => matchesFilter(question, filter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const client = supabaseAdmin;

  const rows = await readAllPages((from, to) => {
    // The id settles ties between questions saved in the same instant, so a
    // row cannot land on two pages, or on none.
    let query = client
      .from("questions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id");

    if (filter.subjectId) query = query.eq("subject_id", filter.subjectId);
    if (filter.difficulty) query = query.eq("difficulty", filter.difficulty);
    if (filter.topicIds?.length) query = query.in("topic_id", filter.topicIds);
    // Literal text, like the memory branch: "%" and "_" are escaped rather
    // than left to match anything, and "*" is checked below (see containsPattern).
    if (filter.search) query = query.ilike("prompt", containsPattern(filter.search));
    if (filter.readyOnly) query = query.eq("status", "ready");
    if (filter.excludeTypes?.length) query = query.not("type", "in", `(${filter.excludeTypes.join(",")})`);

    return query.range(from, to);
  }, "list questions");

  const questions = (rows as QuestionRow[]).map(toQuestion);

  // A "*" went to Postgres as "any one character", so only the rows with the
  // "*" itself in that place are kept.
  const search = filter.search;
  return search && needsTextCheck(search)
    ? questions.filter((question) => containsText(question.prompt, search))
    : questions;
}

export async function getQuestion(id: string): Promise<BankQuestion | null> {
  if (!supabaseAdmin) {
    return memoryQuestions.get(id) ?? null;
  }

  if (!isUuid(id)) return null;

  const { data, error } = await supabaseAdmin.from("questions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load question: ${error.message}`);

  return data ? toQuestion(data as QuestionRow) : null;
}

export async function createQuestions(drafts: QuestionDraft[]): Promise<BankQuestion[]> {
  if (drafts.length === 0) return [];

  if (!supabaseAdmin) {
    const now = new Date().toISOString();
    return drafts.map((draft) => {
      const question: BankQuestion = {
        ...draft,
        status: "ready",
        subtopic: null,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now
      };
      memoryQuestions.set(question.id, question);
      return question;
    });
  }

  const { data, error } = await supabaseAdmin.from("questions").insert(drafts.map((draft) => toRow(draft))).select("*");
  if (error) throw new Error(`Failed to save questions: ${error.message}`);

  return (data as QuestionRow[]).map(toQuestion);
}

export async function updateQuestion(id: string, draft: QuestionDraft): Promise<BankQuestion | null> {
  if (!supabaseAdmin) {
    const existing = memoryQuestions.get(id);
    if (!existing) return null;
    const updated: BankQuestion = {
      ...existing,
      ...draft,
      status: statusAfterSave(existing.status, draft),
      updatedAt: new Date().toISOString()
    };
    memoryQuestions.set(id, updated);
    return updated;
  }

  // Not a uuid, so not a question: a 404, rather than Postgres rejecting it.
  if (!isUuid(id)) return null;

  // The status it has now decides the one it is saved with: a question still
  // waiting for its picture must not be made ready by an edit without one.
  const { data: current, error: readError } = await supabaseAdmin
    .from("questions")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (readError) throw new Error(`Failed to update question: ${readError.message}`);
  if (!current) return null;

  const status = statusAfterSave(((current as { status: string | null }).status ?? "ready") as QuestionStatus, draft);

  const { data, error } = await supabaseAdmin
    .from("questions")
    .update(toRow(draft, status))
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Failed to update question: ${error.message}`);

  return data ? toQuestion(data as QuestionRow) : null;
}

export async function deleteQuestion(id: string): Promise<boolean> {
  if (!supabaseAdmin) {
    return memoryQuestions.delete(id);
  }

  if (!isUuid(id)) return false;

  const { data, error } = await supabaseAdmin.from("questions").delete().eq("id", id).select("id");
  if (error) throw new Error(`Failed to delete question: ${error.message}`);

  return (data ?? []).length > 0;
}

/**
 * The size of the whole bank, whatever the admin list is filtered to.
 *
 * The admin dashboard's heading and its warning about written questions are
 * about the bank, not about the search on screen. Both used to be worked out
 * from the filtered list, so a search with no hits announced "0 questions in
 * the bank". Two counts, so nothing but the numbers is read.
 */
export async function bankSummary(): Promise<{ total: number; written: number }> {
  if (!supabaseAdmin) {
    const all = [...memoryQuestions.values()];
    return { total: all.length, written: all.filter((question) => question.type === "open-ended").length };
  }

  const [all, written] = await Promise.all([
    supabaseAdmin.from("questions").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("questions").select("id", { count: "exact", head: true }).eq("type", "open-ended")
  ]);

  const failure = all.error ?? written.error;
  if (failure) throw new Error(`Failed to count questions: ${failure.message}`);

  return { total: all.count ?? 0, written: written.count ?? 0 };
}

type CountedQuestion = Pick<BankQuestion, "subjectId" | "topicId" | "difficulty" | "type">;

/**
 * The three columns a count needs, for every ready question in the bank.
 *
 * listQuestions reads every column, images and explanations included, none of
 * which a count looks at. Unfinished questions are left out: the counts tell a
 * student what a test can be built from, and a test never includes those.
 */
async function questionsToCount(): Promise<CountedQuestion[]> {
  if (!supabaseAdmin) return [...memoryQuestions.values()].filter((question) => question.status === "ready");

  const client = supabaseAdmin;

  const rows = (await readAllPages(
    (from, to) =>
      client
        .from("questions")
        .select("subject_id, topic_id, difficulty, type", { count: "exact" })
        .eq("status", "ready")
        .order("id")
        .range(from, to),
    "count questions"
  )) as Array<Pick<QuestionRow, "subject_id" | "topic_id" | "difficulty" | "type">>;

  return rows.map((row) => ({
    subjectId: row.subject_id,
    topicId: row.topic_id,
    difficulty: row.difficulty as Difficulty,
    type: row.type as QuestionType
  }));
}

/** Counts of ready questions per subject and topic, for the catalog the builder shows. */
export async function questionCounts(
  options: { excludeTypes?: QuestionType[] } = {}
): Promise<Array<{ subjectId: string; topicId: string; difficulty: Difficulty; count: number }>> {
  const all = (await questionsToCount()).filter((question) => !options.excludeTypes?.includes(question.type));
  const tally = new Map<string, { subjectId: string; topicId: string; difficulty: Difficulty; count: number }>();

  for (const question of all) {
    const key = `${question.subjectId}|${question.topicId}|${question.difficulty}`;
    const entry = tally.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      tally.set(key, {
        subjectId: question.subjectId,
        topicId: question.topicId,
        difficulty: question.difficulty,
        count: 1
      });
    }
  }

  return [...tally.values()];
}
