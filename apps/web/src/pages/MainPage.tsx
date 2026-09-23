import { useEffect, useState } from "react";
import { attemptScoreValue } from "@grade9/shared";
import type { AttemptSummary, SubjectId } from "@grade9/shared";
import { navigate } from "../app/router";
import { useAuth } from "../features/auth/AuthContext";
import { useLanguage, type TranslationKey } from "../lib/i18n";
import { fetchCatalog, fetchHistory } from "../services/testsApi";

/**
 * The subjects as shortcuts into the builder. Each has a glyph a student knows
 * before reading the label: pi for maths, and each language's own letters.
 */
const subjectShortcuts: Array<{ id: SubjectId; glyph: string; label: TranslationKey }> = [
  { id: "math", glyph: "π", label: "subject.math" },
  { id: "english", glyph: "Aa", label: "subject.english" },
  { id: "russian", glyph: "Яя", label: "subject.russian" }
];

function SubjectShortcuts({ counts }: { counts: Record<string, number> | null }) {
  const { t } = useLanguage();

  return (
    <section className="subject-shortcuts" aria-labelledby="subject-shortcuts-title">
      <h2 id="subject-shortcuts-title" className="subject-shortcuts-title">
        {t("main.subjectsTitle")}
      </h2>

      <div className="subject-grid">
        {subjectShortcuts.map((subject) => {
          // Unknown until the catalog answers. A subject is only switched off
          // once the bank has confirmed there is nothing in it, so a slow or
          // failed request never blocks a shortcut that would have worked.
          const count = counts?.[subject.id];
          const empty = count === 0;

          return (
            <button
              key={subject.id}
              type="button"
              className="subject-card"
              disabled={empty}
              onClick={() => navigate(`/build?subject=${subject.id}`)}
            >
              <span className="subject-glyph" aria-hidden="true">
                {subject.glyph}
              </span>
              <span className="subject-name">{t(subject.label)}</span>
              {count !== undefined && (
                <span className="subject-count">{empty ? t("main.soon") : count}</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The landing page.
 *
 * A guest gets the whole pitch on one phone screen: what this is, one button to
 * start, and the subjects to jump into. A signed-in student gets their figures
 * and the four main destinations: Create Test, History, Settings and Friends.
 */
export function MainPage() {
  const { t } = useLanguage();
  const { ready, user, configured } = useAuth();
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

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

  // How many questions each subject has. Not worth a banner if it fails: the
  // shortcuts still work, just without their counts.
  useEffect(() => {
    let active = true;

    fetchCatalog()
      .then((subjects) => {
        if (active) setCounts(Object.fromEntries(subjects.map((item) => [item.id, item.total])));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const best =
    attempts && attempts.length > 0
      ? attempts.reduce((leader, attempt) =>
          attemptScoreValue(attempt) > attemptScoreValue(leader)
            ? attempt
            : leader
        )
      : null;

  const hasHistory = attempts !== null && attempts.length > 0;

  // Nothing until the session is known. A signed-in student would otherwise get
  // the guest welcome, buttons and all, for a moment before their own page.
  if (!ready) return <div className="stack" aria-busy="true" />;

  const stats = (
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
  );

  if (!user) {
    return (
      <div className="stack">
        <section className="welcome">
          <p className="eyebrow">{t("main.eyebrow")}</p>
          <h1 className="welcome-title">{t("main.heroTitle")}</h1>
          <p className="lede">{t("main.lede")}</p>

          <div className="welcome-actions">
            <button
              type="button"
              className="primary-button cta"
              onClick={() => navigate("/build")}
            >
              {t("main.startPractice")}
            </button>

            {/* Only offered when accounts are switched on. Without Supabase
                there is nothing to sign in to. */}
            {configured && (
              <button
                type="button"
                className="ghost-button cta"
                onClick={() => navigate("/login")}
              >
                {t("main.haveAccount")}
              </button>
            )}
          </div>
        </section>

        <SubjectShortcuts counts={counts} />

        {/* Figures only once there are some. Two tiles reading "0" and "No
            tests yet" told a first-time visitor nothing. The banner waits for
            history too: until there is some, there is nothing to lose. */}
        {hasHistory && stats}

        {hasHistory && configured && (
          <p className="warning-banner">
            {t("main.guestBanner")}{" "}
            <a href="#/register">{t("nav.signIn")}</a>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="main-greeting">
        <div>
          <p className="eyebrow">{t("main.eyebrow")}</p>

          <h1>{`${t("main.greeting")}, ${user.fullName}.`}</h1>
        </div>
      </section>

      <p className="lede">{t("main.lede")}</p>

      {/* Placeholders while loading so the page does not jump when the figures
          arrive, and nothing once it is known there is nothing to show. */}
      {(attempts === null || hasHistory) && stats}

      <SubjectShortcuts counts={counts} />

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
