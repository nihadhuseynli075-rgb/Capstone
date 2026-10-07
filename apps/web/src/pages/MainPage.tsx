import { useEffect, useState, type ReactNode } from "react";
import { attemptScoreValue } from "@grade9/shared";
import type { AttemptSummary } from "@grade9/shared";
import { navigate } from "../app/router";
import { Ascent } from "../components/Ascent";
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
import { subjectLabel, topicLabel } from "../lib/testText";
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

/** How many of the latest tests the dashboard's climb draws; History draws them all. */
const CLIMB_POINTS = 8;

/**
 * The topic the student did worst on in their latest test, as a share of its
 * marks, or null if every topic was full marks (or the row predates topic
 * results). It is what "practise next" offers: the last paper is the freshest
 * evidence of what is weak, and one topic is a test that can start at once.
 */
function weakestTopic(attempt: AttemptSummary): { topicId: string; score: number; marks: number } | null {
  const scored = (attempt.topicBreakdown ?? []).filter((topic) => topic.marks > 0 && topic.score < topic.marks);
  if (scored.length === 0) return null;

  return scored.reduce((weakest, topic) =>
    topic.score / topic.marks < weakest.score / weakest.marks ? topic : weakest
  );
}

/** How long an account counts as new, for the greeting. */
const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;

/**
 * The signed-in landing page. A guest gets the landing page instead (see App).
 *
 * Icon tiles for the main jobs: Create Test (the big one, a single tap away),
 * History, Friends, Settings and Profile, with the student's climb beside the
 * start tile. Then a shortcut per subject. On a phone the tiles are the first
 * screen and the climb follows them.
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

  // Oldest first, the order the climb is drawn in.
  const chronological = attempts
    ? [...attempts].sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt))
    : [];
  const latest = chronological.length > 0 ? chronological[chronological.length - 1] : null;
  const weakest = latest ? weakestTopic(latest) : null;

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

        {/* The student's own progress, which is what the site is for: the climb
            so far, the latest and best tests, and the topic to practise next.
            Beside the start tile on a wide screen; under the other tiles on a
            phone, where the tiles are the first screen. */}
        <section className="dash-climb" aria-labelledby="dash-climb-heading">
          <div className="dash-climb-head">
            <h2 id="dash-climb-heading">{t("main.climb")}</h2>

            {latest && (
              <button type="button" className="link-button" onClick={() => navigate("/history")}>
                {t("main.seeHistory")}
              </button>
            )}
          </div>

          {attempts === null ? (
            // Holds the card's height while history loads, so nothing jumps.
            <div className="dash-climb-loading" aria-hidden="true" />
          ) : (
            <Ascent
              variant="compact"
              points={chronological.slice(-CLIMB_POINTS).map((attempt) => ({
                id: attempt.id,
                percent: attempt.percentage,
                label: subjectLabel(t, attempt.subjectId)
              }))}
              bestId={best?.id}
              emptyLabel={t("main.climbEmpty")}
            />
          )}

          {latest && best && (
            <dl className="dash-climb-facts">
              <div>
                <dt>{t("main.lastTest")}</dt>
                <dd>
                  {latest.score}/{latest.totalMarks} <span>{subjectLabel(t, latest.subjectId)}</span>
                </dd>
              </div>

              <div>
                <dt>{t("main.bestScore")}</dt>
                <dd>
                  {best.score}/{best.totalMarks} <span>{subjectLabel(t, best.subjectId)}</span>
                </dd>
              </div>

              <div>
                <dt>{t("main.testsTaken")}</dt>
                <dd>{chronological.length}</dd>
              </div>
            </dl>
          )}

          {latest && weakest && (
            <button
              type="button"
              className="dash-next"
              onClick={() =>
                navigate(`/build?subject=${encodeURIComponent(latest.subjectId)}&topic=${encodeURIComponent(weakest.topicId)}`)
              }
            >
              <span className="dash-next-label">{t("main.practiseNext")}</span>
              <span className="dash-next-topic">
                {topicLabel(t, latest.subjectId, weakest.topicId)}{" "}
                <span className="dash-next-score">
                  {weakest.score}/{weakest.marks}
                </span>
              </span>
              <IconChevron />
            </button>
          )}
        </section>

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

    </div>
  );
}
