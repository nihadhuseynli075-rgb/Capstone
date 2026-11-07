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
  /** 0017; absent on a database from before it. */
  passage_id?: string | null;
  passage_order?: number | null;
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
    // A database from before 0017 has no passages.
    passageId: row.passage_id ?? null,
    passageOrder: row.passage_order ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * The row to write. The passage columns are left out while there is no passage
 * to write or to clear, so a database that has not had 0017 yet still takes
 * every other save: the API can go live before Nihad runs the migration.
 */
function toRow(draft: QuestionDraft, status: QuestionStatus = "ready", writePassage = draft.passageId !== null) {
  const passage = writePassage ? { passage_id: draft.passageId, passage_order: draft.passageOrder } : {};
  return {
    ...passage,
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
 * could be below the page size. History reads it too (see listAttempts).
 */
export async function readAllPages(
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

/**
 * Each question once, the first time it is read.
 *
 * Nihad found questions listed twice on the admin page (7 Nov 2026), where
 * deleting either copy took both away: one row, read twice. A page read can
 * land on the same row twice when the bank changes between two page reads (a
 * save or an import moving rows between pages), and the list keyed every row
 * by its id, so React drew the pair as one row it could not keep apart. Taking
 * repeats out here means no reader (the admin list, the pool a test is drawn
 * from) ever sees one row twice, whatever caused it.
 */
export function withoutRepeats(questions: BankQuestion[]): BankQuestion[] {
  const seen = new Set<string>();
  return questions.filter((question) => {
    if (seen.has(question.id)) return false;
    seen.add(question.id);
    return true;
  });
}

export async function listQuestions(filter: QuestionFilter = {}): Promise<BankQuestion[]> {
  if (!supabaseAdmin) {
    return [...memoryQuestions.values()]
      .filter((question) => matchesFilter(question, filter))
      // Newest first, then by id, the order Supabase reads them in below. A
      // whole import shares one timestamp, and without the id the two stores
      // listed the same import in different orders.
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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

  const questions = withoutRepeats((rows as QuestionRow[]).map(toQuestion));

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

/** One row of a spreadsheet import, with what an import decides that the admin form does not. */
export interface ImportedQuestion {
  draft: QuestionDraft;
  /** A row still missing its options, answer or picture comes in as a draft, out of tests. */
  status: QuestionStatus;
  subtopic: string | null;
  /**
   * The question's paper and number ("dim-2026-04-05-az-c:q37"), or null.
   * A row whose ref is already in the bank updates that question instead of
   * adding a second copy, so a sheet can be fixed and imported again.
   */
  externalRef: string | null;
}

/** The memory store's external_ref column: ref to question id. */
const memoryRefs = new Map<string, string>();

/** Saves an import: questions whose ref is already in the bank are updated, the rest added. */
export async function saveImportedQuestions(
  items: ImportedQuestion[]
): Promise<{ created: BankQuestion[]; updated: BankQuestion[] }> {
  const created: BankQuestion[] = [];
  const updated: BankQuestion[] = [];
  if (items.length === 0) return { created, updated };

  if (!supabaseAdmin) {
    const now = new Date().toISOString();
    for (const item of items) {
      const existingId = item.externalRef ? memoryRefs.get(item.externalRef) : undefined;
      const existing = existingId ? memoryQuestions.get(existingId) : undefined;
      if (existing) {
        const question: BankQuestion = { ...existing, ...item.draft, status: item.status, subtopic: item.subtopic, updatedAt: now };
        memoryQuestions.set(question.id, question);
        updated.push(question);
      } else {
        const question: BankQuestion = {
          ...item.draft,
          status: item.status,
          subtopic: item.subtopic,
          id: randomUUID(),
          createdAt: now,
          updatedAt: now
        };
        memoryQuestions.set(question.id, question);
        if (item.externalRef) memoryRefs.set(item.externalRef, question.id);
        created.push(question);
      }
    }
    return { created, updated };
  }

  const client = supabaseAdmin;
  const refs = [...new Set(items.flatMap((item) => (item.externalRef ? [item.externalRef] : [])))];
  const idByRef = new Map<string, string>();

  for (let start = 0; start < refs.length; start += 200) {
    const { data, error } = await client
      .from("questions")
      .select("id, external_ref")
      .in("external_ref", refs.slice(start, start + 200));
    if (error) throw new Error(`Failed to save questions: ${error.message}`);
    for (const row of (data ?? []) as Array<{ id: string; external_ref: string }>) idByRef.set(row.external_ref, row.id);
  }

  const row = (item: ImportedQuestion) => ({
    ...toRow(item.draft, item.status),
    subtopic: item.subtopic,
    external_ref: item.externalRef
  });

  const fresh = items.filter((item) => !item.externalRef || !idByRef.has(item.externalRef));
  if (fresh.length > 0) {
    const { data, error } = await client.from("questions").insert(fresh.map(row)).select("*");
    if (error) throw new Error(`Failed to save questions: ${error.message}`);
    created.push(...(data as QuestionRow[]).map(toQuestion));
  }

  for (const item of items) {
    const id = item.externalRef ? idByRef.get(item.externalRef) : undefined;
    if (!id) continue;
    // Written in full, passage included, so a passage taken off in the sheet goes.
    const { data, error } = await client
      .from("questions")
      .update({ ...row(item), ...toRow(item.draft, item.status, true) })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Failed to update question: ${error.message}`);
    if (data) updated.push(toQuestion(data as QuestionRow));
  }

  return { created, updated };
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
  // Every column, not just the two wanted: naming passage_id would fail on a
  // database from before 0017.
  const { data: current, error: readError } = await supabaseAdmin
    .from("questions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError) throw new Error(`Failed to update question: ${readError.message}`);
  if (!current) return null;

  const saved = current as { status: string | null; passage_id?: string | null };
  const status = statusAfterSave((saved.status ?? "ready") as QuestionStatus, draft);
  // A passage taken off the question has to be cleared, not left out.
  const writePassage = draft.passageId !== null || (saved.passage_id ?? null) !== null;

  const { data, error } = await supabaseAdmin
    .from("questions")
    .update(toRow(draft, status, writePassage))
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Failed to update question: ${error.message}`);

  return data ? toQuestion(data as QuestionRow) : null;
}

/** The memory store's "on delete set null": a deleted passage's questions keep going without it. */
export function forgetPassage(passageId: string): void {
  for (const [id, question] of memoryQuestions) {
    if (question.passageId === passageId) memoryQuestions.set(id, { ...question, passageId: null, passageOrder: null });
  }
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
