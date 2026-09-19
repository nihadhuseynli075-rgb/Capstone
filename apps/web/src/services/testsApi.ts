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
import { getStudentKey } from "../lib/studentKey";

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
  return apiRequest<GenerateResponse>("/api/tests/generate", {
    method: "POST",
    body: { ...request, studentKey: getStudentKey() }
  });
}

export function submitTest(
  attemptId: string,
  answers: SubmittedAnswer[],
  timeTakenSeconds: number
): Promise<TestResult> {
  return apiRequest<TestResult>(`/api/tests/${attemptId}/submit`, {
    method: "POST",
    body: { studentKey: getStudentKey(), answers, timeTakenSeconds }
  });
}

export async function fetchHistory(): Promise<AttemptSummary[]> {
  const data = await apiRequest<{ attempts: AttemptSummary[] }>(
    `/api/tests/history?studentKey=${encodeURIComponent(getStudentKey())}`
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
  return apiRequest<PastAttempt>(
    `/api/tests/attempts/${attemptId}?studentKey=${encodeURIComponent(getStudentKey())}`
  );
}

/**
 * Moves attempts taken as a guest onto the signed-in account.
 *
 * The signed-in key is filled in by `getStudentKey`, so this only has to say
 * which guest key to pull across.
 */
export function claimGuestHistory(guestKey: string): Promise<{ claimed: number }> {
  return apiRequest<{ claimed: number }>("/api/tests/claim", {
    method: "POST",
    body: { studentKey: getStudentKey(), guestKey }
  });
}
