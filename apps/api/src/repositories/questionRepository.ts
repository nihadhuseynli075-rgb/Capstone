import { randomUUID } from "node:crypto";
import type { BankQuestion, Difficulty, QuestionDraft } from "@grade9/shared";
import { isUuid } from "../lib/ids";
import { supabaseAdmin } from "../lib/supabaseAdmin";

export interface QuestionFilter {
  subjectId?: string;
  topicIds?: string[];
  difficulty?: Difficulty;
  search?: string;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toRow(draft: QuestionDraft) {
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
    source: draft.source
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
  if (filter.search) {
    const needle = filter.search.toLowerCase();
    if (!question.prompt.toLowerCase().includes(needle)) return false;
  }
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
    if (filter.search) query = query.ilike("prompt", `%${filter.search}%`);

    return query.range(from, to);
  }, "list questions");

  return (rows as QuestionRow[]).map(toQuestion);
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
      const question: BankQuestion = { ...draft, id: randomUUID(), createdAt: now, updatedAt: now };
      memoryQuestions.set(question.id, question);
      return question;
    });
  }

  const { data, error } = await supabaseAdmin.from("questions").insert(drafts.map(toRow)).select("*");
  if (error) throw new Error(`Failed to save questions: ${error.message}`);

  return (data as QuestionRow[]).map(toQuestion);
}

export async function updateQuestion(id: string, draft: QuestionDraft): Promise<BankQuestion | null> {
  if (!supabaseAdmin) {
    const existing = memoryQuestions.get(id);
    if (!existing) return null;
    const updated: BankQuestion = { ...existing, ...draft, updatedAt: new Date().toISOString() };
    memoryQuestions.set(id, updated);
    return updated;
  }

  // Not a uuid, so not a question: a 404, rather than Postgres rejecting it.
  if (!isUuid(id)) return null;

  const { data, error } = await supabaseAdmin
    .from("questions")
    .update(toRow(draft))
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

type CountedQuestion = Pick<BankQuestion, "subjectId" | "topicId" | "difficulty">;

/**
 * The three columns a count needs, for every question in the bank.
 *
 * listQuestions reads every column, images and explanations included, none of
 * which a count looks at.
 */
async function questionsToCount(): Promise<CountedQuestion[]> {
  if (!supabaseAdmin) return [...memoryQuestions.values()];

  const client = supabaseAdmin;

  const rows = (await readAllPages(
    (from, to) =>
      client
        .from("questions")
        .select("subject_id, topic_id, difficulty", { count: "exact" })
        .order("id")
        .range(from, to),
    "count questions"
  )) as Array<Pick<QuestionRow, "subject_id" | "topic_id" | "difficulty">>;

  return rows.map((row) => ({
    subjectId: row.subject_id,
    topicId: row.topic_id,
    difficulty: row.difficulty as Difficulty
  }));
}

/** Counts per subject and topic, used to build the catalog the builder shows. */
export async function questionCounts(): Promise<
  Array<{ subjectId: string; topicId: string; difficulty: Difficulty; count: number }>
> {
  const all = await questionsToCount();
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
