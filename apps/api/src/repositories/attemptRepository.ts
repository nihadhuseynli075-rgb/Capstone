import { randomUUID } from "node:crypto";
import type { AttemptSummary, DifficultyMode, TestSettings, TopicPerformance } from "@grade9/shared";
import { isUuid } from "../lib/ids";
import { supabaseAdmin } from "../lib/supabaseAdmin";

/**
 * A question exactly as it was served to the student for one attempt.
 *
 * The answer and explanation are copied here rather than only referenced, so
 * editing or deleting a question later never rewrites somebody's past result.
 */
export interface AttemptQuestion {
  questionId: string | null;
  position: number;
  subjectId: string;
  topicId: string;
  difficulty: string;
  type: string;
  prompt: string;
  options: string[];
  correctAnswer: string;
  /** What the question was worth when it was served, not what it is worth now. */
  marks: number;
  explanation: string;
  imageUrl: string | null;
  studentAnswer: string | null;
  isCorrect: boolean | null;
  /** Marks awarded. Null until the attempt is submitted. */
  score: number | null;
}

export interface StoredAttempt {
  id: string;
  studentKey: string;
  settings: TestSettings;
  questions: AttemptQuestion[];
  score: number | null;
  totalMarks: number | null;
  totalQuestions: number | null;
  percentage: number | null;
  timeTakenSeconds: number | null;
  createdAt: string;
  submittedAt: string | null;
}

const memoryAttempts = new Map<string, StoredAttempt>();

/**
 * The account an attempt belongs to, if it belongs to one at all.
 *
 * `studentKey` is an auth user id once somebody has signed in, and a key their
 * browser made up before that. Only the first of those is a real account, and
 * the foreign key on `student_id` would reject the second, so it has to be
 * looked up rather than assumed.
 *
 * Guests are the common case early on and cost one lookup that finds nothing;
 * this runs once when a test is generated, not on every request.
 */
async function findAccountId(studentKey: string): Promise<string | null> {
  if (!supabaseAdmin) return null;

  // Guest keys are uuids too, so this only rules out the older non-uuid keys.
  // The profiles lookup is what actually decides.
  if (!isUuid(studentKey)) return null;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", studentKey)
    .maybeSingle();

  // Not being able to link an attempt is not a reason to refuse to start the
  // test. `student_key` still identifies the student either way.
  if (error) return null;

  return data ? (data.id as string) : null;
}

export async function createAttempt(input: {
  studentKey: string;
  settings: TestSettings;
  questions: AttemptQuestion[];
}): Promise<StoredAttempt> {
  const attempt: StoredAttempt = {
    id: randomUUID(),
    studentKey: input.studentKey,
    settings: input.settings,
    questions: input.questions,
    score: null,
    totalMarks: input.questions.reduce((sum, question) => sum + question.marks, 0),
    totalQuestions: input.questions.length,
    percentage: null,
    timeTakenSeconds: null,
    createdAt: new Date().toISOString(),
    submittedAt: null
  };

  if (!supabaseAdmin) {
    memoryAttempts.set(attempt.id, attempt);
    return attempt;
  }

  const { data, error } = await supabaseAdmin
    .from("test_attempts")
    .insert({
      student_key: input.studentKey,
      // Set when the student is signed in, so the attempt is genuinely tied to
      // the account: it cascades if the account is deleted, and the row level
      // security policy written against this column can match.
      student_id: await findAccountId(input.studentKey),
      subject_id: input.settings.subjectId,
      topic_ids: input.settings.topicIds,
      difficulty_mode: input.settings.difficultyMode,
      question_count: input.settings.questionCount,
      time_limit_minutes: input.settings.timeLimitMinutes,
      total_questions: input.questions.length,
      total_marks: attempt.totalMarks
    })
    .select("id, created_at")
    .single();

  if (error) throw new Error(`Failed to start attempt: ${error.message}`);

  attempt.id = data.id as string;
  attempt.createdAt = data.created_at as string;

  const { error: questionsError } = await supabaseAdmin.from("attempt_questions").insert(
    input.questions.map((question) => ({
      attempt_id: attempt.id,
      question_id: question.questionId,
      position: question.position,
      subject_id: question.subjectId,
      topic_id: question.topicId,
      difficulty: question.difficulty,
      type: question.type,
      prompt: question.prompt,
      options: question.options,
      correct_answer: question.correctAnswer,
      marks: question.marks,
      explanation: question.explanation,
      image_url: question.imageUrl
    }))
  );

  if (questionsError) {
    // The parent and its snapshots are two HTTP writes through PostgREST rather
    // than one transaction. Remove the parent if the second write fails so an
    // empty, unfinishable attempt is never left in history.
    const { error: cleanupError } = await supabaseAdmin
      .from("test_attempts")
      .delete()
      .eq("id", attempt.id);

    const cleanupDetail = cleanupError ? ` Cleanup also failed: ${cleanupError.message}` : "";
    throw new Error(`Failed to save attempt questions: ${questionsError.message}.${cleanupDetail}`);
  }

  return attempt;
}

export async function getAttempt(id: string): Promise<StoredAttempt | null> {
  if (!supabaseAdmin) {
    return memoryAttempts.get(id) ?? null;
  }

  // A mangled results link is a test that does not exist, not a server error.
  if (!isUuid(id)) return null;

  const { data, error } = await supabaseAdmin
    .from("test_attempts")
    .select("*, attempt_questions(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load attempt: ${error.message}`);
  if (!data) return null;

  const rows = (data.attempt_questions ?? []) as Array<Record<string, unknown>>;

  return {
    id: data.id as string,
    studentKey: data.student_key as string,
    settings: {
      subjectId: data.subject_id as string,
      topicIds: (data.topic_ids ?? []) as string[],
      difficultyMode: data.difficulty_mode as DifficultyMode,
      questionCount: data.question_count as number,
      timeLimitMinutes: (data.time_limit_minutes ?? null) as number | null
    },
    questions: rows
      .map((row) => ({
        questionId: (row.question_id ?? null) as string | null,
        position: row.position as number,
        subjectId: row.subject_id as string,
        topicId: row.topic_id as string,
        difficulty: row.difficulty as string,
        type: row.type as string,
        prompt: row.prompt as string,
        options: Array.isArray(row.options) ? (row.options as string[]) : [],
        correctAnswer: row.correct_answer as string,
        marks: (row.marks ?? 1) as number,
        explanation: (row.explanation ?? "") as string,
        imageUrl: (row.image_url ?? null) as string | null,
        studentAnswer: (row.student_answer ?? null) as string | null,
        isCorrect: (row.is_correct ?? null) as boolean | null,
        score: (row.score ?? null) as number | null
      }))
      .sort((a, b) => a.position - b.position),
    score: (data.score ?? null) as number | null,
    totalMarks: (data.total_marks ?? null) as number | null,
    totalQuestions: (data.total_questions ?? null) as number | null,
    percentage: data.percentage === null || data.percentage === undefined ? null : Number(data.percentage),
    timeTakenSeconds: (data.time_taken_seconds ?? null) as number | null,
    createdAt: data.created_at as string,
    submittedAt: (data.submitted_at ?? null) as string | null
  };
}

/**
 * Records a marked submission, unless the attempt has been submitted already.
 *
 * Returns false when another submission of the same paper got there first: a
 * second tab, or a retry racing the original. Both would otherwise be marked
 * and saved, and the student could be shown one score while another was kept.
 */
export async function completeAttempt(input: {
  attemptId: string;
  score: number;
  totalMarks: number;
  totalQuestions: number;
  percentage: number;
  timeTakenSeconds: number;
  answers: Array<{ position: number; studentAnswer: string; isCorrect: boolean; score: number }>;
}): Promise<boolean> {
  const submittedAt = new Date().toISOString();

  if (!supabaseAdmin) {
    const attempt = memoryAttempts.get(input.attemptId);
    if (!attempt || attempt.submittedAt !== null) return false;

    attempt.score = input.score;
    attempt.totalMarks = input.totalMarks;
    attempt.totalQuestions = input.totalQuestions;
    attempt.percentage = input.percentage;
    attempt.timeTakenSeconds = input.timeTakenSeconds;
    attempt.submittedAt = submittedAt;

    for (const answer of input.answers) {
      const question = attempt.questions.find((item) => item.position === answer.position);
      if (question) {
        question.studentAnswer = answer.studentAnswer;
        question.isCorrect = answer.isCorrect;
        question.score = answer.score;
      }
    }
    return true;
  }

  // Take the attempt first, and only while it is still open. The filter on
  // submitted_at makes the update a compare-and-set: of two submissions racing
  // each other exactly one matches the row, and the other finds out before it
  // has written a single answer over the first one's.
  const { data: taken, error } = await supabaseAdmin
    .from("test_attempts")
    .update({
      score: input.score,
      total_marks: input.totalMarks,
      total_questions: input.totalQuestions,
      percentage: input.percentage,
      time_taken_seconds: input.timeTakenSeconds,
      submitted_at: submittedAt
    })
    .eq("id", input.attemptId)
    .is("submitted_at", null)
    .select("id");

  if (error) throw new Error(`Failed to save result: ${error.message}`);
  if ((taken ?? []).length === 0) return false;

  // The answers are separate writes through PostgREST, not one transaction. If
  // one fails, reopen the attempt, so the student's retry can save everything
  // again rather than being refused as already submitted with answers missing.
  try {
    for (const answer of input.answers) {
      const { error: answerError } = await supabaseAdmin
        .from("attempt_questions")
        .update({
          student_answer: answer.studentAnswer,
          is_correct: answer.isCorrect,
          score: answer.score
        })
        .eq("attempt_id", input.attemptId)
        .eq("position", answer.position);

      if (answerError) throw new Error(`Failed to save answer: ${answerError.message}`);
    }
  } catch (cause) {
    const { error: reopenError } = await supabaseAdmin
      .from("test_attempts")
      .update({ score: null, percentage: null, time_taken_seconds: null, submitted_at: null })
      .eq("id", input.attemptId)
      .eq("submitted_at", submittedAt);

    const reopenDetail = reopenError ? ` Reopening the test also failed: ${reopenError.message}` : "";
    throw new Error(`${(cause as Error).message}.${reopenDetail}`);
  }

  return true;
}

/** Marks earned and available per topic, from an attempt's marked questions. */
function breakdownOf(
  questions: Array<{ topicId: string; marks: number; score: number | null; isCorrect: boolean | null }>
): TopicPerformance[] {
  const topics = new Map<string, TopicPerformance>();

  for (const question of questions) {
    const topic = topics.get(question.topicId) ?? { topicId: question.topicId, score: 0, marks: 0 };
    topic.marks += question.marks;
    // Older rows predate per-question scores, as on the results screen: a
    // correct answer was worth the question's marks.
    topic.score += question.score ?? (question.isCorrect ? question.marks : 0);
    topics.set(question.topicId, topic);
  }

  return [...topics.values()];
}

/** Submitted attempts for one student, newest first. */
export async function listAttempts(studentKey: string): Promise<AttemptSummary[]> {
  if (!supabaseAdmin) {
    return [...memoryAttempts.values()]
      .filter((attempt) => attempt.studentKey === studentKey && attempt.submittedAt !== null)
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
      .map((attempt) => ({
        id: attempt.id,
        subjectId: attempt.settings.subjectId,
        topicIds: attempt.settings.topicIds,
        difficultyMode: attempt.settings.difficultyMode,
        score: attempt.score ?? 0,
        totalMarks: attempt.totalMarks ?? attempt.totalQuestions ?? 0,
        totalQuestions: attempt.totalQuestions ?? 0,
        percentage: attempt.percentage ?? 0,
        timeTakenSeconds: attempt.timeTakenSeconds ?? 0,
        submittedAt: attempt.submittedAt ?? attempt.createdAt,
        topicBreakdown: breakdownOf(attempt.questions)
      }));
  }

  // Only the columns the breakdown needs from each question, not the prompts,
  // options and explanations of every paper the student has sat.
  const { data, error } = await supabaseAdmin
    .from("test_attempts")
    .select("*, attempt_questions(topic_id, marks, score, is_correct)")
    .eq("student_key", studentKey)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(`Failed to load history: ${error.message}`);

  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    subjectId: row.subject_id as string,
    topicIds: (row.topic_ids ?? []) as string[],
    difficultyMode: row.difficulty_mode as DifficultyMode,
    score: (row.score ?? 0) as number,
    // Attempts recorded before marks existed were all one-mark questions, so
    // the question count is exactly the marks that were available.
    totalMarks: (row.total_marks ?? row.total_questions ?? 0) as number,
    totalQuestions: (row.total_questions ?? 0) as number,
    percentage: Number(row.percentage ?? 0),
    timeTakenSeconds: (row.time_taken_seconds ?? 0) as number,
    submittedAt: (row.submitted_at ?? row.created_at) as string,
    topicBreakdown: breakdownOf(
      ((row.attempt_questions ?? []) as Array<Record<string, unknown>>).map((question) => ({
        topicId: question.topic_id as string,
        marks: (question.marks ?? 1) as number,
        score: (question.score ?? null) as number | null,
        isCorrect: (question.is_correct ?? null) as boolean | null
      }))
    )
  }));
}

/**
 * Reassigns a guest's attempts to a signed-in student.
 *
 * Called once when someone who had been practising as a guest creates an
 * account, so their existing history follows them rather than disappearing.
 * Unfinished attempts move too, so a paper started as a guest can still be
 * handed in once the student has signed in. Only attempts still owned by the
 * guest key move, so replaying the call is harmless.
 */
export async function claimAttempts(guestKey: string, studentKey: string): Promise<number> {
  if (guestKey === studentKey) return 0;

  if (!supabaseAdmin) {
    let claimed = 0;
    for (const attempt of memoryAttempts.values()) {
      if (attempt.studentKey === guestKey) {
        attempt.studentKey = studentKey;
        claimed += 1;
      }
    }
    return claimed;
  }

  const { data, error } = await supabaseAdmin
    .from("test_attempts")
    .update({
      student_key: studentKey,
      // These attempts were sat as a guest, so they were recorded with no
      // account against them. Moving them across has to set the link too, or
      // the history would follow the student while the rows still claimed to
      // belong to nobody.
      student_id: await findAccountId(studentKey)
    })
    .eq("student_key", guestKey)
    .select("id");

  if (error) throw new Error(`Failed to move history across: ${error.message}`);

  return (data ?? []).length;
}
