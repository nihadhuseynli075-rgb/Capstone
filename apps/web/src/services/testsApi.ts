import type {
  AttemptSummary,
  CustomDifficulty,
  Difficulty,
  DifficultyMode,
  MockTest,
  QuestionReview,
  ReportReason,
  Sector,
  SiteLanguage,
  SubmittedAnswer,
  TestResult,
  TestSettings
} from "@grade9/shared";
import { ApiError, apiRequest } from "./apiClient";
import { peekIdentity, resolveStudentIdentity, type StudentIdentity } from "../lib/studentKey";

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

/**
 * One subject and its topics, or a sector for a full mock of its three
 * subjects, which takes no topics: it covers every one.
 */
export type GenerateRequest = (
  | { subjectId: string; topicIds: string[]; sector?: never }
  | { sector: Sector; subjectId?: never; topicIds?: never }
) & {
  difficultyMode: DifficultyMode;
  /** Custom mode only. Left out means mixed. */
  customDifficulty?: CustomDifficulty;
  questionCount?: number;
  timeLimitMinutes?: number | null;
  /**
   * The site language right now. Maths questions come back in it where they
   * have a translation, and stay in it for the whole paper whatever the site is
   * switched to afterwards.
   */
  language: SiteLanguage;
};

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

/**
 * Starts a sitting of a test a student made (see the student-tests routes).
 * Answered exactly as generating a test is, so the exam page takes it as it is.
 */
export function startStudentTest(testId: string, language: SiteLanguage): Promise<GenerateResponse> {
  return asStudent(({ studentKey, token }) =>
    apiRequest<GenerateResponse>(`/api/student-tests/${encodeURIComponent(testId)}/start`, {
      method: "POST",
      body: { studentKey, language },
      token
    })
  );
}

/** Reports a question of a handed-in paper as wrong, impossible or unclear. */
export function reportQuestion(
  attemptId: string,
  report: { position: number; reason: ReportReason; details: string }
): Promise<{ reported: true }> {
  return asStudent(({ studentKey, token }) =>
    apiRequest<{ reported: true }>(`/api/tests/${encodeURIComponent(attemptId)}/report`, {
      method: "POST",
      body: { studentKey, ...report },
      token
    })
  );
}

/** The API's refusal of a test that belongs to a different student. */
export function isNotYours(cause: unknown): boolean {
  return cause instanceof ApiError && cause.status === 403 && cause.code === "not-yours";
}

/**
 * A refusal that says the account is not ready to hand this paper in yet,
 * rather than that it never can be. True for a new account still to give its
 * year ("age-required"), and for a paper the account has not yet taken over
 * from this browser's guest key ("not-yours" while signed in with an unclaimed
 * guest key still here): the account takes the guest's tests over only once it
 * has passed the age check (useHistoryClaim). Neither is a reason to put the
 * paper down.
 */
export function isAccountNotReady(cause: unknown): boolean {
  if (!(cause instanceof ApiError) || cause.status !== 403) return false;
  if (cause.code === "age-required") return true;

  const tab = peekIdentity();
  return isNotYours(cause) && tab.userId !== null && tab.guestKey !== null;
}

/** A paper handed in: its result, and the key it went in under. */
export interface HandedIn {
  result: TestResult;
  /**
   * The account's id, or this browser's guest key when the account was not
   * ready to take the paper (see submitTest). The result is kept in the tab
   * under the same one (saveLastResult).
   */
  studentKey: string;
}

/**
 * Hands a paper in. A paper started as a guest belongs to the account once the
 * claim has moved it; until then it is still the guest key's, which happens to
 * a student who signs in in the middle of a test (or whose timer runs out) while
 * the account is still being checked. Refused under the account for that reason
 * (isAccountNotReady), it is handed in as the guest, which the guest key alone
 * allows, and the account takes it over with the rest of the guest's tests. If
 * the claim moved it in between, it goes once more as the account.
 *
 * The claim can also land between the API reading the paper and this tab
 * reading the refusal. It marks the guest key claimed as it lands, so the tab
 * then has no guest key left to try, and the refusal looked final although the
 * paper was the account's by then: it was thrown away. A "not-yours" with no
 * guest key left is therefore tried once more as the account, which settles it
 * either way.
 */
export async function submitTest(
  attemptId: string,
  answers: SubmittedAnswer[],
  timeTakenSeconds: number
): Promise<HandedIn> {
  const send = async (studentKey: string, token?: string): Promise<HandedIn> => ({
    result: await apiRequest<TestResult>(`/api/tests/${attemptId}/submit`, {
      method: "POST",
      body: { studentKey, answers, timeTakenSeconds },
      token
    }),
    studentKey
  });
  const asAccount = () => asStudent(({ studentKey, token }) => send(studentKey, token));

  try {
    return await asAccount();
  } catch (cause) {
    const tab = peekIdentity();
    if (isNotYours(cause) && tab.userId !== null && tab.guestKey === null) return asAccount();
    if (!isAccountNotReady(cause) || tab.guestKey === null) throw cause;

    try {
      return await send(tab.guestKey);
    } catch (asGuest) {
      if (isNotYours(asGuest)) return asAccount();
      throw asGuest;
    }
  }
}

/**
 * Whether a finished test has a score at all.
 *
 * A paper where nothing could be marked (every answer a written one the AI
 * marker could not mark) is saved with no marks available, since every
 * question is worth at least one. It is listed as not scored and left out of
 * bests, the climb and the dashboard's figures, as the API leaves it out of
 * comparisons and friends' figures (isScored in the API's marking.ts).
 * Shown as 0/0 and 0%, it read as a test the student got entirely wrong.
 */
export function isScored(attempt: { totalMarks: number }): boolean {
  return attempt.totalMarks > 0;
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
  /** Positions of questions the student has reported (absent from an older API). */
  reportedPositions?: number[];
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
