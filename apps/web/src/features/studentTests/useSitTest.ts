import { useState } from "react";
import { navigate } from "../../app/router";
import { saveActiveTest } from "../../lib/examSession";
import { useLanguage } from "../../lib/i18n";
import { startStudentTest } from "../../services/testsApi";

/**
 * Starting a sitting of a student-made test from any list of them: asks the
 * API for the paper, puts it where the exam page reads a test it is given, and
 * goes there, as the test builder does with a test drawn from the bank.
 *
 * `starting` is the test being started, so its button can say so and every
 * other one waits; `error` is the last failure, for the list to show.
 */
export function useSitTest() {
  const { language } = useLanguage();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function sit(testId: string): Promise<void> {
    setStarting(testId);
    setError(null);
    try {
      const response = await startStudentTest(testId, language);
      saveActiveTest({
        test: response.test,
        startedAt: Date.now(),
        short: response.short,
        requestedCount: response.requestedCount,
        answers: {},
        currentIndex: 0
      });
      navigate("/exam");
    } catch (cause) {
      setError(cause);
      setStarting(null);
    }
  }

  return { sit, starting, error };
}
