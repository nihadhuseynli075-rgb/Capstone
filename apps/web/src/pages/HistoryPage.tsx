import { useEffect, useState } from "react";
import type { AttemptSummary } from "@grade9/shared";
import { attemptScoreValue, subjectName } from "@grade9/shared";
import { navigate } from "../app/router";
import { fetchHistory } from "../services/testsApi";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function HistoryPage() {
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory()
      .then(setAttempts)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  if (error) {
    return (
      <div className="stack">
        <h1>Test history</h1>
        <p className="error-banner">{error}</p>
      </div>
    );
  }

  if (!attempts) {
    return (
      <div className="stack">
        <h1>Test history</h1>
        <p>Loading your history...</p>
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="stack">
        <h1>Test history</h1>
        <p className="lede">You have not finished a test yet.</p>
        <button type="button" className="primary-button" onClick={() => navigate("/build")}>
          Create your first mock test
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
        <h1>Test history</h1>
        <p className="lede">
          Your best result is highlighted. It accounts for difficulty and test length, not just the
          percentage.
        </p>
      </section>

      <section className="panel best-panel">
        <p className="eyebrow">Best test so far</p>
        <p className="best-score">
          {best.score}/{best.totalQuestions}
          <span className="best-percent">{best.percentage}%</span>
        </p>
        <p className="best-meta">
          {subjectName(best.subjectId)} - {best.difficultyMode} - {formatDate(best.submittedAt)}
        </p>
      </section>

      <section className="panel">
        <h2>All attempts</h2>
        <ul className="attempt-list">
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              <button
                type="button"
                className={`attempt-row ${attempt.id === best.id ? "best" : ""}`}
                onClick={() => navigate(`/results/${attempt.id}`)}
              >
                <span className="attempt-subject">{subjectName(attempt.subjectId)}</span>
                <span className="attempt-mode">{attempt.difficultyMode}</span>
                <span className="attempt-score">
                  {attempt.score}/{attempt.totalQuestions}
                </span>
                <span className="attempt-percent">{attempt.percentage}%</span>
                <span className="attempt-date">{formatDate(attempt.submittedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
