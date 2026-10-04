import type {
  AttemptSummary,
  Difficulty,
  DifficultyMode,
  MockTest,
  QuestionReview,
  SiteLanguage,
  SubmittedAnswer,
  TestResult,
  TestSettings
} from "@grade9/shared";
import { ApiError, apiRequest } from "./apiClient";
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
 * How many claims in this tab have moved guest tests onto the account.
 *
 * Requests stop waiting for a claim after CLAIM_WAIT_MS, and a claim that
 * failed can land later still, on a retry. History read in the meantime came
 * back without the guest's tests and stayed that way on screen until the page
 * was left and opened again. Pages that show history read this count (through
 * useClaimedHistoryVersion) and ask again when it goes up.
 */
let claimedHistoryCount = 0;
const claimedHistoryListeners = new Set<() => void>();

function announceClaimedHistory(): void {
  claimedHistoryCount += 1;
  for (const listener of claimedHistoryListeners) listener();
}

/** Calls `listener` whenever a claim has moved tests; returns the unsubscribe. */
export function subscribeToClaimedHistory(listener: () => void): () => void {
  claimedHistoryListeners.add(listener);
  return () => {
    claimedHistoryListeners.delete(listener);
  };
}

export function claimedHistoryVersion(): number {
  return claimedHistoryCount;
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
  /**
   * The site language right now. Maths questions come back in it where they
   * have a translation, and stay in it for the whole paper whatever the site is
   * switched to afterwards.
   */
  language: SiteLanguage;
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
 * How long to wait before each retry of a claim that failed on the way.
 *
 * A claim that failed once used to be left for the next sign-in. Meanwhile the
 * tab had already handed a paper sat as a guest over to the account (see
 * settleSessionRecords), so handing it in was refused as another account's
 * test and the paper was thrown away, and the history page showed none of the
 * tests taken as a guest. The retries fit inside CLAIM_WAIT_MS, so a request
 * waiting on the claim usually sees the retry land rather than the failure.
 */
const CLAIM_RETRY_DELAYS_MS = [700, 2000];

/**
 * Whether a failed claim is worth sending again straight away.
 *
 * No answer at all, a server error or being asked to slow down can pass on
 * their own. A refusal (signed out, or a key that is an account's) will only
 * be refused again.
 */
export function isPassingClaimFailure(cause: unknown): boolean {
  if (!(cause instanceof ApiError)) return false;
  return cause.status === 0 || cause.status === 429 || cause.status >= 500;
}

/** One claim request, as whoever is signed in right now. */
async function sendClaim(guestKey: string): Promise<{ claimed: number }> {
  const { studentKey, token } = await resolveStudentIdentity();
  return apiRequest<{ claimed: number }>("/api/tests/claim", {
    method: "POST",
    body: { studentKey, guestKey },
    token
  });
}

/**
 * Moves attempts taken as a guest onto the signed-in account.
 *
 * The signed-in key is filled in by `resolveStudentIdentity`, so this only has
 * to say which guest key to pull across. A failure that may pass on its own is
 * tried again a couple of times before it is reported; replaying a claim is
 * harmless, since only attempts still under the guest key move.
 */
export function claimGuestHistory(guestKey: string): Promise<{ claimed: number }> {
  const claim = (async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await sendClaim(guestKey);
      } catch (cause) {
        if (attempt >= CLAIM_RETRY_DELAYS_MS.length || !isPassingClaimFailure(cause)) throw cause;
        await new Promise((resolve) => window.setTimeout(resolve, CLAIM_RETRY_DELAYS_MS[attempt]));
      }
    }
  })();

  // Waiters only need to know it has finished; a failed claim is the caller's
  // to report, and leaves the history where it was. A claim that moved
  // something is announced, for the pages that may have read history before
  // it landed (see subscribeToClaimedHistory).
  const settled: Promise<void> = claim
    .then(
      (result) => {
        if (result.claimed > 0) announceClaimedHistory();
      },
      () => undefined
    )
    .finally(() => {
      if (claimInFlight === settled) claimInFlight = null;
    });
  claimInFlight = settled;

  return claim;
}
