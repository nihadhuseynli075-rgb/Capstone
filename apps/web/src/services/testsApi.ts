import type {
  AttemptSummary,
  Difficulty,
  DifficultyMode,
  MockTest,
  QuestionReview,
  SubmittedAnswer,
  TestResult,
  TestSettings
} from "@grade9/shared";
import { apiRequest } from "./apiClient";
import { resolveStudentIdentity, type StudentIdentity } from "../lib/studentKey";

export interface CatalogTopic {
  id: string;
  name: string;
  counts: Record<Difficulty, number>;
  total: number;
}

export interface CatalogSubject {
  id: string;
  name: string;
  topics: CatalogTopic[];
  total: number;
}

/**
 * How long one catalog answers every caller.
 *
 * The subject shortcuts and the builder a tap later both need it, and each
 * asked for it on its own; the counts only move when an admin adds questions.
 */
const CATALOG_FRESH_MS = 30_000;

let catalogRequest: { at: number; subjects: Promise<CatalogSubject[]> } | null = null;

export function fetchCatalog(): Promise<CatalogSubject[]> {
  if (catalogRequest && Date.now() - catalogRequest.at < CATALOG_FRESH_MS) {
    return catalogRequest.subjects;
  }

  const request = {
    at: Date.now(),
    subjects: apiRequest<{ subjects: CatalogSubject[] }>("/api/catalog").then((data) => data.subjects)
  };
  catalogRequest = request;

  // A failure is not worth keeping: the next caller should ask again.
  request.subjects.catch(() => {
    if (catalogRequest === request) catalogRequest = null;
  });

  return request.subjects;
}

/**
 * A claim of guest history this tab has in flight, if any.
 *
 * Signing in starts the claim and, a moment later, the first screen asks for
 * history. The claim takes more database round trips, so the history usually
 * won the race and came back without the tests taken as a guest - the very
 * thing the claim exists to avoid - and nothing asked again. Anything that
 * reads or finishes an attempt waits for the claim first.
 */
let claimInFlight: Promise<unknown> | null = null;

/** Longest a claim may hold anything up: a stuck one must not stall history. */
const CLAIM_WAIT_MS = 5000;

async function afterClaim(): Promise<void> {
  if (!claimInFlight) return;

  let timer: number | undefined;
  await Promise.race([
    claimInFlight,
    new Promise((resolve) => {
      timer = window.setTimeout(resolve, CLAIM_WAIT_MS);
    })
  ]);
  window.clearTimeout(timer);
}

/**
 * Sends a request as the current student: their key, the token backing it, and
 * only once any claim of guest history in flight has finished.
 *
 * The order matters. The claim is started by an effect that runs after the
 * page's own, and reading the session first gives it the moment it needs to
 * register. Keeping both steps here is what lets every request rely on that.
 */
async function asStudent<T>(send: (identity: StudentIdentity) => Promise<T>): Promise<T> {
  const identity = await resolveStudentIdentity();
  await afterClaim();
  return send(identity);
}

export interface GenerateRequest {
  subjectId: string;
  topicIds: string[];
  difficultyMode: DifficultyMode;
  questionCount?: number;
  timeLimitMinutes?: number | null;
}

export interface GenerateResponse {
  test: MockTest;
  short: boolean;
  requestedCount: number;
}

export function generateMockTest(request: GenerateRequest): Promise<GenerateResponse> {
  return asStudent(({ studentKey, token }) =>
    apiRequest<GenerateResponse>("/api/tests/generate", {
      method: "POST",
      body: { ...request, studentKey },
      token
    })
  );
}

/** A paper started as a guest belongs to the account once the claim has moved it. */
export function submitTest(
  attemptId: string,
  answers: SubmittedAnswer[],
  timeTakenSeconds: number
): Promise<TestResult> {
  return asStudent(({ studentKey, token }) =>
    apiRequest<TestResult>(`/api/tests/${attemptId}/submit`, {
      method: "POST",
      body: { studentKey, answers, timeTakenSeconds },
      token
    })
  );
}

export async function fetchHistory(): Promise<AttemptSummary[]> {
  const data = await asStudent(({ studentKey, token }) =>
    apiRequest<{ attempts: AttemptSummary[] }>(
      `/api/tests/history?studentKey=${encodeURIComponent(studentKey)}`,
      { token }
    )
  );
  return data.attempts;
}

export interface PastAttempt {
  attemptId: string;
  settings: TestSettings;
  score: number;
  totalMarks: number;
  totalQuestions: number;
  percentage: number;
  timeTakenSeconds: number;
  submittedAt: string;
  reviews: QuestionReview[];
}

export function fetchAttempt(attemptId: string): Promise<PastAttempt> {
  return asStudent(({ studentKey, token }) =>
    apiRequest<PastAttempt>(
      `/api/tests/attempts/${encodeURIComponent(attemptId)}?studentKey=${encodeURIComponent(studentKey)}`,
      { token }
    )
  );
}

/**
 * Moves attempts taken as a guest onto the signed-in account.
 *
 * The signed-in key is filled in by `resolveStudentIdentity`, so this only has
 * to say which guest key to pull across.
 */
export function claimGuestHistory(guestKey: string): Promise<{ claimed: number }> {
  const claim = resolveStudentIdentity().then(({ studentKey, token }) =>
    apiRequest<{ claimed: number }>("/api/tests/claim", {
      method: "POST",
      body: { studentKey, guestKey },
      token
    })
  );

  // Waiters only need to know it has finished; a failed claim is the caller's
  // to report, and leaves the history where it was.
  const settled: Promise<void> = claim
    .then(() => undefined, () => undefined)
    .finally(() => {
      if (claimInFlight === settled) claimInFlight = null;
    });
  claimInFlight = settled;

  return claim;
}
