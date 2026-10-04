import { useEffect, useState, type ReactNode } from "react";
import { attemptScoreValue } from "@grade9/shared";
import type { AttemptSummary } from "@grade9/shared";
import { navigate } from "../app/router";
import {
  IconChevron,
  IconFriends,
  IconHistory,
  IconProfile,
  IconSettings,
  IconTest
} from "../components/icons";
import { ResumeTestBanner } from "../components/ResumeTestBanner";
import { SubjectShortcuts } from "../components/SubjectShortcuts";
import { useAuth } from "../features/auth/AuthContext";
import { useClaimedHistoryVersion } from "../features/auth/useHistoryClaim";
import { useProfile } from "../features/profile/ProfileContext";
import { useLanguage, type TranslationKey } from "../lib/i18n";
import { fetchHistory } from "../services/testsApi";
import "../styles/dashboard.css";

/**
 * The pages the dashboard opens besides the test builder, one tile each.
 *
 * `tone` only picks the tile's accent colour in dashboard.css. A tile should
 * read as its icon first and its name second: a student can tell which page it
 * is before reading anything.
 */
const destinations: Array<{
  path: string;
  tone: string;
  icon: ReactNode;
  title: TranslationKey;
  body: TranslationKey;
}> = [
  { path: "/history", tone: "history", icon: <IconHistory />, title: "main.history", body: "main.historyBody" },
  { path: "/friends", tone: "friends", icon: <IconFriends />, title: "main.friends", body: "main.friendsBody" },
  { path: "/settings", tone: "settings", icon: <IconSettings />, title: "main.settings", body: "main.settingsBody" },
  { path: "/profile", tone: "profile", icon: <IconProfile />, title: "nav.profile", body: "main.profileBody" }
];

/** How long an account counts as new, for the greeting. */
const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;

/**
 * The signed-in landing page. A guest gets the landing page instead (see App).
 *
 * Icon tiles for the main jobs: Create Test (the big one, a single tap away),
 * History, Friends, Settings and Profile. Then a shortcut per subject and the
 * student's figures. On a phone the tiles are the first screen.
 */
export function MainPage() {
  const { t } = useLanguage();
  const { ready, user } = useAuth();
  // Guest tests moved onto the account after history was read: read it again.
  const claimedVersion = useClaimedHistoryVersion();
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
  }, [ready, user?.id, claimedVersion]);

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

  // "Welcome back" straight after making an account greets someone who has
  // never been here before. An account from the last day is greeted as new.
  // Judged from the session, which is there at once, rather than from the
  // history, which arrives later and would change the heading under them.
  const createdAt = Date.parse(user.createdAt);
  const isNewAccount = Number.isFinite(createdAt) && Date.now() - createdAt < NEW_ACCOUNT_MS;

  return (
    <div className="stack dashboard">
      <section className="main-greeting">
        <div>
          <p className="eyebrow">{t("main.eyebrow")}</p>

          <h1>{`${t(isNewAccount ? "main.greetingNew" : "main.greeting")}, ${profile?.fullName ?? user.fullName}.`}</h1>
        </div>
      </section>

      <ResumeTestBanner />

      {/* The tiles say the same thing in pictures, so a phone drops this. */}
      <p className="lede main-lede">{t("main.lede")}</p>

      {/* Starting a test is the main job, so its tile is the biggest and the
          first one in reach: one tap to the builder, from any width. */}
      <section className="dash-tiles">
        <button
          type="button"
          className="dash-tile is-primary"
          onClick={() => navigate("/build")}
        >
          <span className="dash-tile-icon">
            <IconTest />
          </span>

          <span className="dash-tile-text">
            <span className="dash-tile-title">
              {t("main.createTest")}
            </span>

            <span className="dash-tile-body">
              {t("main.createTestBody")}
            </span>
          </span>

          <span className="dash-tile-go">
            <IconChevron />
          </span>
        </button>

        {destinations.map((destination) => (
          <button
            key={destination.path}
            type="button"
            className={`dash-tile is-${destination.tone}`}
            onClick={() => navigate(destination.path)}
          >
            <span className="dash-tile-icon">
              {destination.icon}
            </span>

            <span className="dash-tile-text">
              <span className="dash-tile-title">
                {t(destination.title)}
              </span>

              <span className="dash-tile-body">
                {t(destination.body)}
              </span>
            </span>
          </button>
        ))}
      </section>

      <SubjectShortcuts className="dash-subjects" />

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
    </div>
  );
}
