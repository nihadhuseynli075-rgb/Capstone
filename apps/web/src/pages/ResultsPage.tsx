import { useEffect, useMemo, useState } from "react";
import type { AttemptComparison, QuestionReview, TopicPerformance } from "@grade9/shared";
import { navigate, replaceRoute } from "../app/router";
import { useAuth } from "../features/auth/AuthContext";
import { fill } from "../features/friends/fill";
import { loadLastResult } from "../lib/examSession";
import { useLanguage, type TranslationKey } from "../lib/i18n";
import { difficultyLabel, subjectLabel, testErrorText, topicLabel } from "../lib/testText";
import { fetchAttempt } from "../services/testsApi";

interface ResultView {
  attemptId: string;
  subjectId: string | null;
  score: number;
  totalMarks: number;
  totalQuestions: number;
  percentage: number;
  timeTakenSeconds: number;
  topicBreakdown: TopicPerformance[];
  reviews: QuestionReview[];
  comparison: AttemptComparison | null;
}

/** Past attempts come back without a breakdown, so rebuild it from the reviews. */
function breakdownFromReviews(reviews: QuestionReview[]): TopicPerformance[] {
  const topics = new Map<string, TopicPerformance>();

  for (const review of reviews) {
    const entry = topics.get(review.topicId) ?? { topicId: review.topicId, score: 0, marks: 0 };
    entry.marks += review.marks;
    entry.score += review.score;
    topics.set(review.topicId, entry);
  }

  return [...topics.values()];
}

function formatDuration(seconds: number, t: (key: TranslationKey) => string): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return fill(t("results.durationSeconds"), { s: String(rest) });
  return fill(t("results.durationMinutes"), { m: String(minutes), s: String(rest).padStart(2, "0") });
}

/**
 * Written answers can earn some of their marks, and one the marker could not
 * reach is neither right nor wrong, so the badge says which.
 */
function verdictOf(review: QuestionReview): {
  label: TranslationKey;
  tone: "correct" | "partial" | "wrong" | "unmarked";
} {
  if (review.counted === false) return { label: "results.notMarked", tone: "unmarked" };
  if (review.isCorrect) {
    return { label: review.type === "open-ended" ? "results.fullMarks" : "results.correct", tone: "correct" };
  }
  if (review.type === "open-ended" && review.score > 0) return { label: "results.partly", tone: "partial" };
  return { label: "results.wrong", tone: "wrong" };
}

/** Anything short of full marks is worth another look, except an answer nobody marked. */
function isMistake(review: QuestionReview): boolean {
  return !review.isCorrect && review.counted !== false;
}

/**
 * The earlier best's score and what kind of test it was: "3/10" and
 * "Mathematics, Easy". The subject is named because the best can be in a
 * different one from this test: a 3/10 under an English result was the maths
 * test before it, and said nothing of the kind.
 */
function bestDetails(
  best: NonNullable<AttemptComparison["previousBest"]>,
  t: (key: TranslationKey) => string
): { score: string; difficulty: string } {
  const what = [best.subjectId ? subjectLabel(t, best.subjectId) : null, difficultyLabel(t, best.difficultyMode)]
    .filter(Boolean)
    .join(", ");

  return { score: `${best.score}/${best.totalMarks}`, difficulty: what };
}

/** The line under the score, in the site language. */
function comparisonLine(comparison: AttemptComparison, t: (key: TranslationKey) => string): string {
  const best = comparison.previousBest;
  if (!best) return t("results.firstTest");

  const { score, difficulty } = bestDetails(best, t);

  if (comparison.isPersonalBest) return fill(t("results.newBest"), { score: `${score} (${difficulty})` });
  // A tie is not a new best: the same 5/5 twice used to be announced as one.
  if (comparison.matchedBest) return fill(t("results.matchedBest"), { score, difficulty });
  return fill(t("results.bestSoFar"), { score, difficulty });
}

export function ResultsPage({ attemptId }: { attemptId?: string }) {
  const [view, setView] = useState<ResultView | null>(null);
  // The failure rather than its sentence, so it is shown in the current language.
  const [error, setError] = useState<unknown>(null);
  const [showOnlyMistakes, setShowOnlyMistakes] = useState(false);
  const { ready, user } = useAuth();
  const { t, tn } = useLanguage();

  useEffect(() => {
    // Reopening a past attempt is checked against the student key, so asking
    // before the session has loaded sends the guest key and comes back as
    // "that test belongs to a different student".
    if (attemptId && !ready) return;

    // A new attempt, or a different account, starts clean: an error left from
    // the last request stayed on screen over a result that had since loaded,
    // and the previous attempt's result sat under the new one's address.
    let active = true;
    setError(null);

    if (attemptId) {
      setView(null);

      fetchAttempt(attemptId)
        .then((attempt) => {
          if (!active) return;
          setView({
            attemptId: attempt.attemptId,
            subjectId: attempt.settings.subjectId,
            score: attempt.score,
            totalMarks: attempt.totalMarks,
            totalQuestions: attempt.totalQuestions,
            percentage: attempt.percentage,
            timeTakenSeconds: attempt.timeTakenSeconds,
            topicBreakdown: breakdownFromReviews(attempt.reviews),
            reviews: attempt.reviews,
            comparison: null
          });
        })
        .catch((cause: unknown) => {
          if (active) setError(cause);
        });

      return () => {
        active = false;
      };
    }

    // No result in this tab: the address is swapped for the history, not
    // added to it, so Back does not keep returning here to be sent on again.
    const stored = loadLastResult();
    if (!stored) {
      replaceRoute("/history");
      return;
    }

    setView({
      attemptId: stored.attemptId,
      subjectId: stored.subjectId ?? null,
      score: stored.score,
      totalMarks: stored.totalMarks,
      totalQuestions: stored.totalQuestions,
      percentage: stored.percentage,
      timeTakenSeconds: stored.timeTakenSeconds,
      topicBreakdown: stored.topicBreakdown,
      reviews: stored.reviews,
      comparison: stored.comparison
    });
  }, [attemptId, ready, user?.id]);

  // Keep the original question number attached, so filtering to mistakes still
  // says "Q4" rather than renumbering what is left.
  const visibleReviews = useMemo(() => {
    if (!view) return [];
    const numbered = view.reviews.map((review, index) => ({ review, number: index + 1 }));
    return showOnlyMistakes ? numbered.filter((item) => isMistake(item.review)) : numbered;
  }, [view, showOnlyMistakes]);

  if (error !== null) {
    return (
      <div className="stack">
        <h1>{t("results.title")}</h1>
        <p className="error-banner">{testErrorText(error, t, "test.errNotSubmitted")}</p>
        <button type="button" className="ghost-button" onClick={() => navigate("/history")}>
          {t("results.backToHistory")}
        </button>
      </div>
    );
  }

  // A heading and a status line while the result is fetched: a bare
  // paragraph was never read out, and left the page with no h1 to land on.
  if (!view) {
    return (
      <div className="stack">
        <h1>{t("results.title")}</h1>
        <p role="status">{t("results.loading")}</p>
      </div>
    );
  }

  const mistakeCount = view.reviews.filter(isMistake).length;

  return (
    <div className="stack">
      <section className="score-hero">
        <div className="score-figure">
          <span className="score-value">
            {view.score}
            <span className="score-total">/{view.totalMarks}</span>
          </span>
          <span className="score-unit">{t("results.marksUnit")}</span>
          <span className="score-percent">{view.percentage}%</span>
        </div>

        <div className="score-meta">
          <h1>
            {view.subjectId
              ? fill(t("results.completeSubject"), { subject: subjectLabel(t, view.subjectId) })
              : t("results.complete")}
          </h1>
          <p>
            {fill(t("results.summary"), {
              questions: tn("count.questions", view.totalQuestions),
              time: formatDuration(view.timeTakenSeconds, t),
              mistakes: tn("count.mistakes", mistakeCount)
            })}
          </p>

          {view.comparison && (
            <p
              className={`comparison ${
                view.comparison.isPersonalBest || view.comparison.matchedBest ? "best" : ""
              }`}
            >
              {comparisonLine(view.comparison, t)}
            </p>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>{t("results.byTopic")}</h2>
        <ul className="topic-bars">
          {view.topicBreakdown.map((topic) => {
            const percent =
              topic.marks === 0 ? 0 : Math.round((topic.score / topic.marks) * 100);

            return (
              <li key={topic.topicId}>
                <div className="topic-bar-header">
                  <span>{topicLabel(t, view.subjectId ?? "", topic.topicId)}</span>
                  <span>
                    {topic.score}/{topic.marks}
                  </span>
                </div>
                <div className="topic-bar-track">
                  <div
                    className={`topic-bar-fill ${percent < 50 ? "weak" : percent < 80 ? "ok" : "strong"}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel">
        <div className="review-header">
          <h2>{t("results.everyQuestion")}</h2>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={showOnlyMistakes}
              onChange={(event) => setShowOnlyMistakes(event.target.checked)}
            />
            {t("results.onlyMistakes")}
          </label>
        </div>

        <ol className="review-list">
          {visibleReviews.map(({ review, number }) => (
            <li key={review.questionId} className={`review ${verdictOf(review).tone}`}>
              <div className="review-top">
                <span className="review-index">{fill(t("results.questionNumber"), { n: String(number) })}</span>
                <span className="review-marks">
                  {review.counted === false
                    ? t("results.notCounted")
                    : tn("results.marksOf", review.marks, { score: review.score })}
                </span>
                <span className={`review-badge ${verdictOf(review).tone}`}>{t(verdictOf(review).label)}</span>
              </div>

              {/* The question, the answers and the explanation are the paper's
                  own text, kept from when it was served, and are not translated. */}
              <p className="review-prompt">{review.prompt}</p>

              {review.imageUrl && (
                <img className="question-image" src={review.imageUrl} alt={t("exam.diagram")} />
              )}

              <div className="review-answers">
                <p>
                  <span className="review-label">{t("exam.yourAnswer")}</span>
                  <span
                    // A written answer is rarely all wrong, so it is not painted red:
                    // the marks and the feedback say how it went.
                    className={
                      review.type === "open-ended"
                        ? `written-answer-text${review.isCorrect ? " answer-correct" : ""}`
                        : review.isCorrect
                          ? "answer-correct"
                          : "answer-wrong"
                    }
                  >
                    {review.studentAnswer.trim().length > 0 ? review.studentAnswer : t("results.leftBlank")}
                  </span>
                </p>
                {!review.isCorrect && (
                  <p>
                    <span className="review-label">
                      {review.type === "open-ended" ? t("results.markerLookedFor") : t("results.correctAnswer")}
                    </span>
                    <span className={review.type === "open-ended" ? "written-answer-text" : "answer-correct"}>
                      {review.correctAnswer}
                    </span>
                  </p>
                )}
              </div>

              {review.feedback && (
                <p className="review-feedback">
                  <strong>{t("results.feedback")} </strong>
                  {review.feedback}
                </p>
              )}

              {review.counted === false && (
                <p className="review-feedback unmarked">{t("results.unmarkedNote")}</p>
              )}

              {review.explanation.trim().length > 0 && (
                <p className="review-explanation">
                  <strong>{t("results.why")} </strong>
                  {review.explanation}
                </p>
              )}
            </li>
          ))}
        </ol>

        {visibleReviews.length === 0 && <p className="empty-note">{t("results.noMistakes")}</p>}
      </section>

      <div className="exam-actions">
        <button type="button" className="ghost-button" onClick={() => navigate("/history")}>
          {t("main.history")}
        </button>
        <button type="button" className="primary-button" onClick={() => navigate("/build")}>
          {t("results.another")}
        </button>
      </div>
    </div>
  );
}
