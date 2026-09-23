import type { MockTest, TestResult } from "@grade9/shared";

const ACTIVE_TEST_KEY = "examPeak.activeTest";
const PROGRESS_KEY = "examPeak.activeTestProgress";
const LAST_RESULT_KEY = "examPeak.lastResult";

export interface ActiveTest {
  test: MockTest;
  /** Wall-clock start, so the timer stays accurate across a page refresh. */
  startedAt: number;
  short: boolean;
  requestedCount: number;
  /** Answers so far, by question id. */
  answers: Record<string, string>;
  /** The question on screen. */
  currentIndex: number;
}

/**
 * The in-progress test lives in session storage rather than React state so that
 * an accidental refresh mid-exam does not wipe the paper, and so the countdown
 * can be recalculated from the original start time instead of counting ticks.
 *
 * The paper and the student's progress through it are kept apart. The paper
 * never changes once the test starts and can be large (without Supabase,
 * diagrams travel inside it as data URLs), so it is written once, here. Every
 * answer after that rewrites only the small progress record (saveProgress).
 */
export function saveActiveTest(active: ActiveTest): void {
  const { answers, currentIndex, ...paper } = active;
  window.sessionStorage.setItem(ACTIVE_TEST_KEY, JSON.stringify(paper));
  saveProgress(paper.test.id, answers, currentIndex);
}

/** Records the answers and the question on screen for the paper in progress. */
export function saveProgress(testId: string, answers: Record<string, string>, currentIndex: number): void {
  window.sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({ testId, answers, currentIndex }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStored(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isExamQuestion(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.subjectId === "string" &&
    typeof value.topicId === "string" &&
    typeof value.difficulty === "string" &&
    (value.type === "multiple-choice" || value.type === "short-answer") &&
    typeof value.prompt === "string" &&
    Array.isArray(value.options) &&
    value.options.every((option) => typeof option === "string") &&
    (value.marks === undefined || typeof value.marks === "number") &&
    (value.imageUrl === undefined || value.imageUrl === null || typeof value.imageUrl === "string")
  );
}

/**
 * A saved paper, checked before the exam screen trusts it.
 *
 * Session storage outlives a deploy, so a tab can hold a paper saved by an
 * older build, or anything else written under this key. The exam screen used
 * whatever it found and threw on the first field that was not there, leaving a
 * blank page that reloading only repeated. What the screen cannot do without is
 * required; the answers and the question on screen are repaired rather than
 * refused, since dropping a bad value there costs nothing that matters.
 *
 * Progress is taken from the progress record when it is for this paper. A paper
 * saved by an older build carries its answers inside it instead.
 */
function readActiveTest(value: unknown, progress: unknown): ActiveTest | null {
  if (!isRecord(value) || !isRecord(value.test) || !isRecord(value.test.settings)) return null;

  const test = value.test;
  const questions = test.questions;
  const limit = (test.settings as Record<string, unknown>).timeLimitMinutes;

  if (
    typeof test.id !== "string" ||
    typeof test.title !== "string" ||
    !(limit === null || (typeof limit === "number" && Number.isFinite(limit))) ||
    !Array.isArray(questions) ||
    questions.length === 0 ||
    !questions.every(isExamQuestion) ||
    typeof value.startedAt !== "number" ||
    !Number.isFinite(value.startedAt)
  ) {
    return null;
  }

  const saved = isRecord(progress) && progress.testId === test.id ? progress : value;

  const answers: Record<string, string> = {};
  if (isRecord(saved.answers)) {
    for (const [questionId, answer] of Object.entries(saved.answers)) {
      if (typeof answer === "string") answers[questionId] = answer;
    }
  }

  const index = saved.currentIndex;

  return {
    test: {
      ...(test as unknown as MockTest),
      // A paper saved before marks existed: every question was worth one.
      questions: questions.map((question) => ({
        ...question,
        marks: typeof question.marks === "number" ? question.marks : 1
      })) as unknown as MockTest["questions"]
    },
    startedAt: value.startedAt,
    short: value.short === true,
    requestedCount: typeof value.requestedCount === "number" ? value.requestedCount : questions.length,
    answers,
    currentIndex:
      typeof index === "number" && Number.isInteger(index)
        ? Math.min(Math.max(index, 0), questions.length - 1)
        : 0
  };
}

export function loadActiveTest(): ActiveTest | null {
  const raw = window.sessionStorage.getItem(ACTIVE_TEST_KEY);
  if (!raw) return null;

  const progress = window.sessionStorage.getItem(PROGRESS_KEY);
  const active = readActiveTest(parseStored(raw), progress === null ? null : parseStored(progress));

  // It can never be resumed, so drop it rather than meet it on every visit.
  if (!active) clearActiveTest();
  return active;
}

export function clearActiveTest(): void {
  window.sessionStorage.removeItem(ACTIVE_TEST_KEY);
  window.sessionStorage.removeItem(PROGRESS_KEY);
}

/**
 * A just-marked result, plus the subject it came from.
 *
 * The API returns topic ids but not the subject, and topic names are only
 * resolvable within a subject. Carrying it here is what lets the results screen
 * say "Functions and Graphs" rather than falling back to the tidied-up id.
 */
export interface StoredResult extends TestResult {
  subjectId?: string;
}

export function saveLastResult(result: StoredResult): void {
  window.sessionStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result));
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === "number";
}

function isReview(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.questionId === "string" &&
    typeof value.prompt === "string" &&
    typeof value.topicId === "string" &&
    typeof value.studentAnswer === "string" &&
    typeof value.correctAnswer === "string" &&
    typeof value.explanation === "string" &&
    typeof value.isCorrect === "boolean" &&
    isOptionalNumber(value.score) &&
    isOptionalNumber(value.marks)
  );
}

/**
 * A stored result, checked before the results screen trusts it, for the same
 * reason as readActiveTest: a missing field there blanked the page instead of
 * falling back to the history list.
 */
function readLastResult(value: unknown): StoredResult | null {
  if (
    !isRecord(value) ||
    typeof value.attemptId !== "string" ||
    !Array.isArray(value.reviews) ||
    !value.reviews.every(isReview) ||
    !Array.isArray(value.topicBreakdown) ||
    !value.topicBreakdown.every((topic) => isRecord(topic) && typeof topic.topicId === "string") ||
    !(value.comparison === undefined || value.comparison === null || isRecord(value.comparison))
  ) {
    return null;
  }

  return value as unknown as StoredResult;
}

export function loadLastResult(): StoredResult | null {
  const raw = window.sessionStorage.getItem(LAST_RESULT_KEY);
  if (!raw) return null;

  return readLastResult(parseStored(raw));
}
