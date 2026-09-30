import { useEffect, useState } from "react";
import { attemptScoreValue } from "@grade9/shared";
import type { AttemptSummary } from "@grade9/shared";
import { navigate } from "../app/router";
import { SubjectShortcuts } from "../components/SubjectShortcuts";
import { useAuth } from "../features/auth/AuthContext";
import { useProfile } from "../features/profile/ProfileContext";
import { useLanguage } from "../lib/i18n";
import { fetchHistory } from "../services/testsApi";

/**
 * The signed-in landing page. A guest gets the landing page instead (see App).
 *
 * Four main destinations:
 * Create Test, History, Settings and Friends.
 */
export function MainPage() {
  const { t } = useLanguage();
  const { ready, user } = useAuth();
  const { profile } = useProfile();
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);

  // Held until the session is known, so the tiles are not filled in with the
  // guest key's history and then corrected a moment later.
  useEffect(() => {
    if (!ready) return;

    let active = true;

    fetchHistory()
      .then((rows) => {
        if (active) setAttempts(rows);
      })
      .catch(() => {
        if (active) setAttempts([]);
      });

    return () => {
      active = false;
    };
  }, [ready, user?.id]);

  const best =
    attempts && attempts.length > 0
      ? attempts.reduce((leader, attempt) =>
          attemptScoreValue(attempt) > attemptScoreValue(leader)
            ? attempt
            : leader
        )
      : null;

  const hasHistory = attempts !== null && attempts.length > 0;

  // App only shows this page to a signed-in student.
  if (!user) return null;

  return (
    <div className="stack">
      <section className="main-greeting">
        <div>
          <p className="eyebrow">{t("main.eyebrow")}</p>

          <h1>{`${t("main.greeting")}, ${profile?.fullName ?? user.fullName}.`}</h1>
        </div>
      </section>

      <p className="lede">{t("main.lede")}</p>

      {/* Placeholders while loading so the page does not jump when the figures
          arrive, and nothing once it is known there is nothing to show: two
          tiles reading "0" and "No tests yet" told a new student nothing. */}
      {(attempts === null || hasHistory) && (
        <section className="stat-row">
          <div className="stat">
            <div className="stat-value">
              {attempts === null ? "-" : attempts.length}
            </div>

            <div className="stat-label">
              {t("main.testsTaken")}
            </div>
          </div>

          <div className="stat">
            {/* A score is a number and is set like one. "No tests yet" is a
                sentence, and at the same size it wrapped across three lines and
                read as the headline of the page. */}
            <div className={`stat-value ${best ? "" : "stat-value-empty"}`}>
              {best
                ? `${best.score}/${best.totalMarks}`
                : t("main.noTests")}
            </div>

            <div className="stat-label">
              {t("main.bestScore")}
            </div>
          </div>
        </section>
      )}

      <SubjectShortcuts />

      <section className="card-grid">
        <button
          type="button"
          className="action-card primary"
          onClick={() => navigate("/build")}
        >
          <span className="action-card-title">
            {t("main.createTest")}
          </span>

          <span className="action-card-body">
            {t("main.createTestBody")}
          </span>
        </button>

        <button
          type="button"
          className="action-card"
          onClick={() => navigate("/history")}
        >
          <span className="action-card-title">
            {t("main.history")}
          </span>

          <span className="action-card-body">
            {t("main.historyBody")}
          </span>
        </button>

        <button
          type="button"
          className="action-card"
          onClick={() => navigate("/settings")}
        >
          <span className="action-card-title">
            {t("main.settings")}
          </span>

          <span className="action-card-body">
            {t("main.settingsBody")}
          </span>
        </button>

        <button
          type="button"
          className="action-card"
          onClick={() => navigate("/friends")}
        >
          <span className="action-card-title">
            {t("main.friends")}
          </span>

          <span className="action-card-body">
            {t("main.friendsBody")}
          </span>
        </button>
      </section>
    </div>
  );
}
