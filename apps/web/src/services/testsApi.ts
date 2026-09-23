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
import { resolveStudentKey } from "../lib/studentKey";

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

export async function fetchCatalog(): Promise<CatalogSubject[]> {
  const data = await apiRequest<{ subjects: CatalogSubject[] }>("/api/catalog");
  return data.subjects;
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

export async function generateMockTest(request: GenerateRequest): Promise<GenerateResponse> {
  return apiRequest<GenerateResponse>("/api/tests/generate", {
    method: "POST",
    body: { ...request, studentKey: await resolveStudentKey() }
  });
}

export async function submitTest(
  attemptId: string,
  answers: SubmittedAnswer[],
  timeTakenSeconds: number
): Promise<TestResult> {
  const studentKey = await resolveStudentKey();
  // A paper started as a guest belongs to the account only once it has moved.
  await afterClaim();

  return apiRequest<TestResult>(`/api/tests/${attemptId}/submit`, {
    method: "POST",
    body: { studentKey, answers, timeTakenSeconds }
  });
}

export async function fetchHistory(): Promise<AttemptSummary[]> {
  const studentKey = await resolveStudentKey();
  await afterClaim();

  const data = await apiRequest<{ attempts: AttemptSummary[] }>(
    `/api/tests/history?studentKey=${encodeURIComponent(studentKey)}`
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

export async function fetchAttempt(attemptId: string): Promise<PastAttempt> {
  const studentKey = await resolveStudentKey();
  await afterClaim();

  return apiRequest<PastAttempt>(
    `/api/tests/attempts/${encodeURIComponent(attemptId)}?studentKey=${encodeURIComponent(studentKey)}`
  );
}

/**
 * Moves attempts taken as a guest onto the signed-in account.
 *
 * The signed-in key is filled in by `resolveStudentKey`, so this only has to
 * say which guest key to pull across.
 */
export function claimGuestHistory(guestKey: string): Promise<{ claimed: number }> {
  const claim = (async () =>
    apiRequest<{ claimed: number }>("/api/tests/claim", {
      method: "POST",
      body: { studentKey: await resolveStudentKey(), guestKey }
    }))();

  // Waiters only need to know it has finished; a failed claim is the caller's
  // to report, and leaves the history where it was.
  const settled = claim.then(
    () => undefined,
    () => undefined
  );
  claimInFlight = settled;
  void settled.then(() => {
    if (claimInFlight === settled) claimInFlight = null;
  });

  return claim;
}
