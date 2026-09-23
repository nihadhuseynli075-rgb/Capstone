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

export async function listQuestions(filter: QuestionFilter = {}): Promise<BankQuestion[]> {
  if (!supabaseAdmin) {
    return [...memoryQuestions.values()]
      .filter((question) => matchesFilter(question, filter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  let query = supabaseAdmin.from("questions").select("*").order("created_at", { ascending: false });

  if (filter.subjectId) query = query.eq("subject_id", filter.subjectId);
  if (filter.difficulty) query = query.eq("difficulty", filter.difficulty);
  if (filter.topicIds?.length) query = query.in("topic_id", filter.topicIds);
  if (filter.search) query = query.ilike("prompt", `%${filter.search}%`);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list questions: ${error.message}`);

  return (data as QuestionRow[]).map(toQuestion);
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

/** Counts per subject and topic, used to build the catalog the builder shows. */
export async function questionCounts(): Promise<
  Array<{ subjectId: string; topicId: string; difficulty: Difficulty; count: number }>
> {
  const all = await listQuestions();
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
