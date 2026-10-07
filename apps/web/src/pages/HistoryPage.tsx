import { useEffect, useMemo, useState } from "react";
import type { AttemptSummary } from "@grade9/shared";
import { attemptScoreValue } from "@grade9/shared";
import { navigate } from "../app/router";
import { Ascent } from "../components/Ascent";
import { useAuth } from "../features/auth/AuthContext";
import { useClaimedHistoryVersion } from "../features/auth/useHistoryClaim";
import { formatDayTime, formatPercent, useLanguage } from "../lib/i18n";
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
  // Which subject's climb is drawn and listed; null is every subject.
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);

  // Oldest first, the order the climb is drawn in. Sorted here rather than
  // trusted from the API, so a store that lists newest first draws the same.
  const chronological = useMemo(
    () =>
      attempts
        ? [...attempts].sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt))
        : [],
    [attempts]
  );

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
        {/* An alert, so a failed load is said out loud and not only painted. */}
        <p className="error-banner" role="alert">{testErrorText(error, t)}</p>
      </div>
    );
  }

  if (!attempts) {
    return (
      <div className="stack">
        <h1>{t("main.history")}</h1>
        {/* A status, so a screen reader says the list is on its way. */}
        <p role="status">{t("history.loading")}</p>
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

  // The subjects this student has actually sat, in the order first taken, so
  // the filter never offers a subject with nothing to show.
  const subjectIds = [...new Set(chronological.map((attempt) => attempt.subjectId))];
  const shown = subjectFilter
    ? attempts.filter((attempt) => attempt.subjectId === subjectFilter)
    : attempts;
  const climb = chronological.filter((attempt) => !subjectFilter || attempt.subjectId === subjectFilter);
  // The flag goes on the best of what is drawn, chosen exactly as the "best
  // test so far" panel chooses: from the list in the API's order, the first of
  // equals winning. Reducing over the oldest-first climb instead put the flag
  // on a different test than the panel whenever two tests tied.
  const climbBest = shown.reduce((leader, attempt) =>
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
          <span className="best-percent">{formatPercent(best.percentage, language)}</span>
        </p>
        <p className="best-meta">
          {subjectLabel(t, best.subjectId)} - {difficultyLabel(t, best.difficultyMode)} -{" "}
          {formatDayTime(best.submittedAt, language)}
        </p>
      </section>

      <section className="panel climb-panel" aria-labelledby="climb-heading">
        <div className="climb-head">
          <h2 id="climb-heading">{t("history.climb")}</h2>

          {/* Only worth offering once there is more than one subject to tell apart. */}
          {subjectIds.length > 1 && (
            <div className="chip-row climb-filter" role="group" aria-label={t("history.climb")}>
              <button
                type="button"
                className={`chip ${subjectFilter === null ? "selected" : ""}`}
                aria-pressed={subjectFilter === null}
                onClick={() => setSubjectFilter(null)}
              >
                {t("history.allSubjects")}
              </button>

              {subjectIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`chip ${subjectFilter === id ? "selected" : ""}`}
                  aria-pressed={subjectFilter === id}
                  onClick={() => setSubjectFilter(id)}
                >
                  {subjectLabel(t, id)}
                </button>
              ))}
            </div>
          )}
        </div>

        <Ascent
          variant="full"
          points={climb.map((attempt) => ({
            id: attempt.id,
            percent: attempt.percentage,
            label: `${subjectLabel(t, attempt.subjectId)} · ${attempt.score}/${attempt.totalMarks} · ${formatDayTime(attempt.submittedAt, language)}`
          }))}
          bestId={climbBest.id}
          emptyLabel={t("history.empty")}
          onSelect={(id) => navigate(`/results/${id}`)}
        />

        {/* What the drawing shows, in words; the list below is every point on it. */}
        <p className="climb-note">{t("history.climbNote")}</p>
      </section>

      <section className="panel">
        <h2>{t("history.all")}</h2>
        <ul className="attempt-list">
          {shown.map((attempt) => (
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
                <span className="attempt-percent">{formatPercent(attempt.percentage, language)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
