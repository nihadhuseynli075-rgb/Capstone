import type { MockTest, TestResult } from "@grade9/shared";

const ACTIVE_TEST_KEY = "examPeak.activeTest";
const LAST_RESULT_KEY = "examPeak.lastResult";

export interface ActiveTest {
  test: MockTest;
  /** Wall-clock start, so the timer stays accurate across a page refresh. */
  startedAt: number;
  short: boolean;
  requestedCount: number;
  /** Optional so an exam saved by an older build can still be resumed. */
  answers?: Record<string, string>;
  currentIndex?: number;
}

/**
 * The in-progress test lives in session storage rather than React state so that
 * an accidental refresh mid-exam does not wipe the paper, and so the countdown
 * can be recalculated from the original start time instead of counting ticks.
 */
export function saveActiveTest(active: ActiveTest): void {
  window.sessionStorage.setItem(ACTIVE_TEST_KEY, JSON.stringify(active));
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
 */
function readActiveTest(value: unknown): ActiveTest | null {
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

  const answers: Record<string, string> = {};
  if (isRecord(value.answers)) {
    for (const [questionId, answer] of Object.entries(value.answers)) {
      if (typeof answer === "string") answers[questionId] = answer;
    }
  }

  const index = value.currentIndex;

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

  const active = readActiveTest(parseStored(raw));

  // It can never be resumed, so drop it rather than meet it on every visit.
  if (!active) clearActiveTest();
  return active;
}

export function clearActiveTest(): void {
  window.sessionStorage.removeItem(ACTIVE_TEST_KEY);
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
