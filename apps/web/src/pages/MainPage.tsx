import { useEffect, useState } from "react";
import { attemptScoreValue } from "@grade9/shared";
import type { AttemptSummary } from "@grade9/shared";
import { navigate } from "../app/router";
import { useAuth } from "../features/auth/AuthContext";
import { useLanguage } from "../lib/i18n";
import { fetchHistory } from "../services/testsApi";

/**
 * The signed-in landing page.
 *
 * Four destinations, plus the two numbers worth seeing without clicking into
 * history. Friends is shown but disabled rather than hidden, because a plan
 * everyone has agreed on is easier to keep track of when it is visible.
 */
export function MainPage() {
  const { t } = useLanguage();
  const { ready, user, configured } = useAuth();
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
      // The two stat tiles are a nicety; a failure here must not take the page
      // down, so fall back to "no tests yet" and let History report the error.
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
          attemptScoreValue(attempt) > attemptScoreValue(leader) ? attempt : leader
        )
      : null;

  return (
    <div className="stack">
      <section className="main-greeting">
        <div>
          <p className="eyebrow">Grade 9 final exam prep</p>
          <h1>
            {user ? `${t("main.greeting")}, ${user.fullName}.` : t("main.greetingGuest")}
          </h1>
        </div>
      </section>

      <p className="lede">{t("main.lede")}</p>

      {configured && !user && (
        <p className="warning-banner">
          {t("main.guestBanner")} <a href="#/register">{t("nav.signIn")}</a>
        </p>
      )}

      <section className="stat-row">
        <div className="stat">
          <div className="stat-value">{attempts === null ? "-" : attempts.length}</div>
          <div className="stat-label">{t("main.testsTaken")}</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {best ? `${best.score}/${best.totalMarks}` : t("main.noTests")}
          </div>
          <div className="stat-label">{t("main.bestScore")}</div>
        </div>
      </section>

      <section className="card-grid">
        <button type="button" className="action-card primary" onClick={() => navigate("/build")}>
          <span className="action-card-title">{t("main.createTest")}</span>
          <span className="action-card-body">{t("main.createTestBody")}</span>
        </button>

        <button type="button" className="action-card" onClick={() => navigate("/history")}>
          <span className="action-card-title">{t("main.history")}</span>
          <span className="action-card-body">{t("main.historyBody")}</span>
        </button>

        <button type="button" className="action-card" onClick={() => navigate("/settings")}>
          <span className="action-card-title">{t("main.settings")}</span>
          <span className="action-card-body">{t("main.settingsBody")}</span>
        </button>

        <div className="action-card disabled" aria-disabled="true">
          <span className="soon-badge">{t("main.soon")}</span>
          <span className="action-card-title">{t("main.friends")}</span>
          <span className="action-card-body">{t("main.friendsBody")}</span>
        </div>
      </section>
    </div>
  );
}
