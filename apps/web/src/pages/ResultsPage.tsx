import { useEffect, useMemo, useState } from "react";
import type { AttemptComparison, QuestionReview, TopicPerformance } from "@grade9/shared";
import { subjectName, topicName } from "@grade9/shared";
import { navigate, replaceRoute } from "../app/router";
import { useAuth } from "../features/auth/AuthContext";
import { errorText } from "../features/profile/profileText";
import { loadLastResult } from "../lib/examSession";
import { useLanguage } from "../lib/i18n";
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

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}s`;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

/**
 * Written answers can earn some of their marks, and one the marker could not
 * reach is neither right nor wrong, so the badge says which.
 */
function verdictOf(review: QuestionReview): { label: string; tone: "correct" | "partial" | "wrong" | "unmarked" } {
  if (review.counted === false) return { label: "Not marked", tone: "unmarked" };
  if (review.isCorrect) return { label: review.type === "open-ended" ? "Full marks" : "Correct", tone: "correct" };
  if (review.type === "open-ended" && review.score > 0) return { label: "Partly right", tone: "partial" };
  return { label: "Wrong", tone: "wrong" };
}

/** Anything short of full marks is worth another look, except an answer nobody marked. */
function isMistake(review: QuestionReview): boolean {
  return !review.isCorrect && review.counted !== false;
}

export function ResultsPage({ attemptId }: { attemptId?: string }) {
  const { t } = useLanguage();
  const [view, setView] = useState<ResultView | null>(null);
  // The failure itself, worded when shown (errorText).
  const [error, setError] = useState<unknown>(null);
  const [showOnlyMistakes, setShowOnlyMistakes] = useState(false);
  const { ready, user } = useAuth();

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
        <h1>Results</h1>
        <p className="error-banner">{errorText(error, t)}</p>
        <button type="button" className="ghost-button" onClick={() => navigate("/history")}>
          Back to history
        </button>
      </div>
    );
  }

  if (!view) return <p>Loading your results...</p>;

  const mistakeCount = view.reviews.filter(isMistake).length;

  return (
    <div className="stack">
      <section className="score-hero">
        <div className="score-figure">
          <span className="score-value">
            {view.score}
            <span className="score-total">/{view.totalMarks}</span>
          </span>
          <span className="score-unit">marks</span>
          <span className="score-percent">{view.percentage}%</span>
        </div>

        <div className="score-meta">
          <h1>
            {view.subjectId ? `${subjectName(view.subjectId)} test complete` : "Test complete"}
          </h1>
          <p>
            {view.totalQuestions} question{view.totalQuestions === 1 ? "" : "s"} in{" "}
            {formatDuration(view.timeTakenSeconds)} - {mistakeCount} mistake
            {mistakeCount === 1 ? "" : "s"} to review.
          </p>

          {view.comparison && (
            <p className={`comparison ${view.comparison.isPersonalBest ? "best" : ""}`}>
              {view.comparison.isPersonalBest
                ? view.comparison.previousBest
                  ? `New personal best. Your previous best was ${view.comparison.previousBest.score}/${view.comparison.previousBest.totalMarks}.`
                  : "First test recorded. Everything from here is measured against this one."
                : `Your best so far is ${view.comparison.previousBest?.score}/${view.comparison.previousBest?.totalMarks} on a ${view.comparison.previousBest?.difficultyMode} test.`}
            </p>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>How you did by topic</h2>
        <ul className="topic-bars">
          {view.topicBreakdown.map((topic) => {
            const percent =
              topic.marks === 0 ? 0 : Math.round((topic.score / topic.marks) * 100);

            return (
              <li key={topic.topicId}>
                <div className="topic-bar-header">
                  <span>{topicName(view.subjectId ?? "", topic.topicId)}</span>
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
          <h2>Every question</h2>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={showOnlyMistakes}
              onChange={(event) => setShowOnlyMistakes(event.target.checked)}
            />
            Show only my mistakes
          </label>
        </div>

        <ol className="review-list">
          {visibleReviews.map(({ review, number }) => (
            <li key={review.questionId} className={`review ${verdictOf(review).tone}`}>
              <div className="review-top">
                <span className="review-index">Q{number}</span>
                <span className="review-marks">
                  {review.counted === false
                    ? "Not counted"
                    : `${review.score}/${review.marks} ${review.marks === 1 ? "mark" : "marks"}`}
                </span>
                <span className={`review-badge ${verdictOf(review).tone}`}>{verdictOf(review).label}</span>
              </div>

              <p className="review-prompt">{review.prompt}</p>

              {review.imageUrl && (
                <img className="question-image" src={review.imageUrl} alt="Question diagram" />
              )}

              <div className="review-answers">
                <p>
                  <span className="review-label">Your answer</span>
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
                    {review.studentAnswer.trim().length > 0 ? review.studentAnswer : "Left blank"}
                  </span>
                </p>
                {!review.isCorrect && (
                  <p>
                    <span className="review-label">
                      {review.type === "open-ended" ? "What the marker looked for" : "Correct answer"}
                    </span>
                    <span className={review.type === "open-ended" ? "written-answer-text" : "answer-correct"}>
                      {review.correctAnswer}
                    </span>
                  </p>
                )}
              </div>

              {review.feedback && (
                <p className="review-feedback">
                  <strong>Teacher's feedback: </strong>
                  {review.feedback}
                </p>
              )}

              {review.counted === false && (
                <p className="review-feedback unmarked">
                  This answer could not be marked just now, so it is not counted in your score either way.
                </p>
              )}

              {review.explanation.trim().length > 0 && (
                <p className="review-explanation">
                  <strong>Why: </strong>
                  {review.explanation}
                </p>
              )}
            </li>
          ))}
        </ol>

        {visibleReviews.length === 0 && (
          <p className="empty-note">No mistakes on this one. Nothing to review.</p>
        )}
      </section>

      <div className="exam-actions">
        <button type="button" className="ghost-button" onClick={() => navigate("/history")}>
          Test history
        </button>
        <button type="button" className="primary-button" onClick={() => navigate("/build")}>
          Take another test
        </button>
      </div>
    </div>
  );
}
