import { useEffect, useState } from "react";
import type { AttemptSummary } from "@grade9/shared";
import { attemptScoreValue } from "@grade9/shared";
import { navigate } from "../app/router";
import { useAuth } from "../features/auth/AuthContext";
import { useClaimedHistoryVersion } from "../features/auth/useHistoryClaim";
import { formatDayTime, useLanguage } from "../lib/i18n";
import { difficultyLabel, subjectLabel, testErrorText } from "../lib/testText";
import { fetchHistory } from "../services/testsApi";

export function HistoryPage() {
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  // The failure rather than its sentence, so it is shown in the current language.
  const [error, setError] = useState<unknown>(null);
  const { ready, user } = useAuth();
  // Guest tests moved onto the account after history was read: read it again.
  const claimedVersion = useClaimedHistoryVersion();
  const { language, t } = useLanguage();

  // Waits for the stored session before asking, and asks again if the account
  // changes. Fetching on mount alone sent the guest key while Supabase was
  // still restoring the session, so opening this page directly while signed in
  // showed an empty history that only a refresh fixed.
  useEffect(() => {
    if (!ready) return;

    let active = true;
    setError(null);

    fetchHistory()
      .then((rows) => {
        if (active) setAttempts(rows);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause);
      });

    return () => {
      active = false;
    };
  }, [ready, user?.id, claimedVersion]);

  if (error !== null) {
    return (
      <div className="stack">
        <h1>{t("main.history")}</h1>
        <p className="error-banner">{testErrorText(error, t)}</p>
      </div>
    );
  }

  if (!attempts) {
    return (
      <div className="stack">
        <h1>{t("main.history")}</h1>
        <p>{t("history.loading")}</p>
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="stack">
        <h1>{t("main.history")}</h1>
        <p className="lede">{t("history.empty")}</p>
        <button type="button" className="primary-button" onClick={() => navigate("/build")}>
          {t("history.first")}
        </button>
      </div>
    );
  }

  // Best is weighted for difficulty and length, so a short easy test does not
  // sit above a long hard one with the same percentage.
  const best = attempts.reduce((leader, attempt) =>
    attemptScoreValue(attempt) > attemptScoreValue(leader) ? attempt : leader
  );

  return (
    <div className="stack">
      <section>
        <h1>{t("main.history")}</h1>
        <p className="lede">{t("history.lede")}</p>
      </section>

      <section className="panel best-panel">
        <p className="eyebrow">{t("history.best")}</p>
        <p className="best-score">
          {best.score}/{best.totalMarks}
          <span className="best-percent">{best.percentage}%</span>
        </p>
        <p className="best-meta">
          {subjectLabel(t, best.subjectId)} - {difficultyLabel(t, best.difficultyMode)} -{" "}
          {formatDayTime(best.submittedAt, language)}
        </p>
      </section>

      <section className="panel">
        <h2>{t("history.all")}</h2>
        <ul className="attempt-list">
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              <button
                type="button"
                className={`attempt-row ${attempt.id === best.id ? "best" : ""}`}
                onClick={() => navigate(`/results/${attempt.id}`)}
              >
                <span className="attempt-subject">{subjectLabel(t, attempt.subjectId)}</span>
                {/* Difficulty and date travel together: on a phone the row is
                    two columns, and they are one line of small print under the
                    subject rather than two cells of a puzzle. */}
                <span className="attempt-meta">
                  <span className="attempt-mode">{difficultyLabel(t, attempt.difficultyMode)}</span>
                  <span className="attempt-date">{formatDayTime(attempt.submittedAt, language)}</span>
                </span>
                <span className="attempt-score">
                  {attempt.score}/{attempt.totalMarks}
                </span>
                <span className="attempt-percent">{attempt.percentage}%</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
