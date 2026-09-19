import type { MockTest, TestResult } from "@grade9/shared";

const ACTIVE_TEST_KEY = "examPeak.activeTest";
const LAST_RESULT_KEY = "examPeak.lastResult";

export interface ActiveTest {
  test: MockTest;
  /** Wall-clock start, so the timer stays accurate across a page refresh. */
  startedAt: number;
  short: boolean;
  requestedCount: number;
}

/**
 * The in-progress test lives in session storage rather than React state so that
 * an accidental refresh mid-exam does not wipe the paper, and so the countdown
 * can be recalculated from the original start time instead of counting ticks.
 */
export function saveActiveTest(active: ActiveTest): void {
  window.sessionStorage.setItem(ACTIVE_TEST_KEY, JSON.stringify(active));
}

export function loadActiveTest(): ActiveTest | null {
  const raw = window.sessionStorage.getItem(ACTIVE_TEST_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ActiveTest;
  } catch {
    return null;
  }
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

export function loadLastResult(): StoredResult | null {
  const raw = window.sessionStorage.getItem(LAST_RESULT_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredResult;
  } catch {
    return null;
  }
}
