import { useEffect, useState, type ReactNode } from "react";
import { attemptScoreValue } from "@grade9/shared";
import type { AttemptSummary } from "@grade9/shared";
import { navigate } from "../app/router";
import {
  IconChevron,
  IconFriends,
  IconHistory,
  IconProfile,
  IconTest
} from "../components/icons";
import { ResumeTestBanner } from "../components/ResumeTestBanner";
import { SubjectShortcuts } from "../components/SubjectShortcuts";
import { useAuth } from "../features/auth/AuthContext";
import { useProfile } from "../features/profile/ProfileContext";
import { useLanguage, type TranslationKey } from "../lib/i18n";
import { fetchHistory, isScored } from "../services/testsApi";
import "../styles/dashboard.css";

/**
 * The pages the dashboard opens besides the test builder, one tile each.
 * Settings has no tile of its own: the language and theme are on the profile
 * page now, so a second tile would open the same page.
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
  {
    path: "/history",
    tone: "history",
    icon: <IconHistory />,
    title: "main.history",
    body: "main.historyBody"
  },
  {
    path: "/friends",
    tone: "friends",
    icon: <IconFriends />,
    title: "main.friends",
    body: "main.friendsBody"
  },
  {
    path: "/profile",
    tone: "profile",
    icon: <IconProfile />,
    title: "nav.profile",
    body: "main.profileBody"
  }
];

/** How long an account counts as new, for the greeting. */
const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;

/**
 * The signed-in landing page. A guest gets the landing page instead (see App).
 *
 * A greeting banner that carries the student's figures, then icon tiles for
 * the main jobs: Create Test (the big one, a single tap away), History,
 * Friends and Profile. Then a shortcut per subject. On a phone the
 * tiles are the first screen.
 */
export function MainPage() {
  const { t } = useLanguage();
  const { ready, user } = useAuth();
  const { profile } = useProfile();

  const [attempts, setAttempts] =
    useState<AttemptSummary[] | null>(null);

  // Held until the session is known, so the tiles are not filled in with the
  // guest key's history and then corrected a moment later.
  useEffect(() => {
    if (!ready) return;

    let active = true;

    fetchHistory()
      .then((rows) => {
        if (active) {
          setAttempts(rows);
        }
      })
      .catch(() => {
        if (active) {
          setAttempts([]);
        }
      });

    return () => {
      active = false;
    };
  }, [ready, user?.id]);

  // A test where nothing could be marked has no score, so it is neither a
  // test taken nor a best here, as in a friend's figures (see isScored).
  const scored =
    attempts === null ? null : attempts.filter(isScored);

  const best =
    scored && scored.length > 0
      ? scored.reduce((leader, attempt) =>
          attemptScoreValue(attempt) >
          attemptScoreValue(leader)
            ? attempt
            : leader
        )
      : null;

  const hasHistory =
    scored !== null &&
    scored.length > 0;

  // App only shows this page to a signed-in student.
  if (!user) {
    return null;
  }

  // "Welcome back" straight after making an account greets someone who has
  // never been here before. An account from the last day is greeted as new.
  // Judged from the session, which is there at once, rather than from the
  // history, which arrives later and would change the heading under them.
  const createdAt =
    Date.parse(user.createdAt);

  const isNewAccount =
    Number.isFinite(createdAt) &&
    Date.now() - createdAt <
      NEW_ACCOUNT_MS;

  return (
    <div className="stack dashboard">
      <section className="main-greeting">
        <div className="main-greeting-text">
          <p className="eyebrow">
            {t("main.eyebrow")}
          </p>

          <h1>
            {`${t(
              isNewAccount
                ? "main.greetingNew"
                : "main.greeting"
            )}, ${
              profile?.fullName ??
              user.fullName
            }.`}
          </h1>

          {/* The tiles say the same thing in pictures, so a phone drops this. */}
          <p className="main-lede">
            {t("main.lede")}
          </p>

          {/* The student's figures sit in the banner, where they are read with
              the greeting, rather than in two plain boxes at the bottom of the
              page. Placeholders while loading so the banner does not jump when
              the figures arrive, and nothing once it is known there is nothing
              to show: "0" and "No tests yet" told a new student nothing. */}
          {(attempts === null ||
            hasHistory) && (
            <dl className="greeting-stats">
              <div className="greeting-stat">
                <dt>{t("main.testsTaken")}</dt>
                <dd>
                  {scored === null
                    ? "-"
                    : scored.length}
                </dd>
              </div>

              <div className="greeting-stat">
                <dt>{t("main.bestScore")}</dt>
                <dd>
                  {best
                    ? `${best.score}/${best.totalMarks}`
                    : "-"}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <GreetingRidge />
      </section>

      <ResumeTestBanner />

      {/* Starting a test is the main job, so its tile is the biggest and the
          first one in reach: one tap to the builder, from any width. */}
      <section className="dash-tiles">
        <button
          type="button"
          className="dash-tile is-primary"
          onClick={() =>
            navigate("/build")
          }
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

          {/* The three stages of a test, as on the landing page. Only on a
              wide screen, where this tile is two rows tall and would otherwise
              be mostly empty blue. */}
          <span className="dash-tile-steps" aria-hidden="true">
            {[t("landing.stepBuild"), t("landing.stepSit"), t("landing.stepReview")].map(
              (step, index) => (
                <span key={step} className="dash-tile-step">
                  <span className="dash-tile-step-n">{index + 1}</span>
                  {step}
                </span>
              )
            )}
          </span>

          <span className="dash-tile-go">
            <IconChevron />
          </span>
        </button>

        {destinations.map(
          (destination) => (
            <button
              key={destination.path}
              type="button"
              className={
                `dash-tile is-${destination.tone}`
              }
              onClick={() =>
                navigate(
                  destination.path
                )
              }
            >
              <span className="dash-tile-icon">
                {destination.icon}
              </span>

              <span className="dash-tile-text">
                <span className="dash-tile-title">
                  {t(
                    destination.title
                  )}
                </span>

                <span className="dash-tile-body">
                  {t(
                    destination.body
                  )}
                </span>
              </span>
            </button>
          )
        )}
      </section>

      <SubjectShortcuts className="dash-subjects" />
    </div>
  );
}

/**
 * The banner's picture: the name drawn as a range of peaks, the nearest one
 * with a flag on its summit. Testers found the dashboard plain and dark; this
 * gives the banner depth without words a screen reader would have to read.
 */
function GreetingRidge() {
  return (
    <svg
      className="greeting-ridge"
      viewBox="0 0 520 220"
      preserveAspectRatio="xMaxYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="ridge-far"
        d="M0 220 L70 150 L120 175 L200 90 L260 140 L330 70 L400 130 L460 95 L520 140 L520 220 Z"
      />
      <path
        className="ridge-mid"
        d="M40 220 L130 160 L185 185 L280 105 L340 150 L390 120 L470 175 L520 165 L520 220 Z"
      />
      <path
        className="ridge-near"
        d="M150 220 L250 165 L300 180 L370 60 L430 150 L470 135 L520 175 L520 220 Z"
      />
      {/* The snow cap and the flag on the nearest summit (370, 60). */}
      <path className="ridge-snow" d="M370 60 L392 98 L380 92 L370 104 L360 92 L350 98 Z" />
      <path className="ridge-pole" d="M370 60 L370 26" />
      <path className="ridge-flag" d="M370 26 L396 34 L370 42 Z" />
    </svg>
  );
}