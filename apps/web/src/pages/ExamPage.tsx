import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SubmittedAnswer } from "@grade9/shared";
import { topicName } from "@grade9/shared";
import { navigate } from "../app/router";
import {
  clearActiveTest,
  loadActiveTest,
  saveActiveTest,
  saveLastResult,
  type ActiveTest
} from "../lib/examSession";
import { ApiError } from "../services/apiClient";
import { submitTest } from "../services/testsApi";

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function ExamPage() {
  const [active, setActive] = useState<ActiveTest | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Set when the server will never accept this paper, however many times it is
  // offered. Retrying is then the one thing not to suggest.
  const [dead, setDead] = useState(false);

  // Auto-submit and a manual click can race; this makes sure only one wins.
  const submittedRef = useRef(false);

  // Set once the paper is over - marked, found already marked, or out of time -
  // and its saved copy cleared. Saving after that would put a finished paper
  // back, to be reopened on the next visit to this page.
  const closedRef = useRef(false);

  const paletteRef = useRef<HTMLDivElement>(null);

  // The countdown fires once when it reaches zero and then leaves it alone.
  // Without this the timer retries the same failing request on every tick, so a
  // test the server will not accept turns into a request a second, for as long
  // as the page is left open. One attempt, then a button.
  const autoSubmitRef = useRef(false);

  useEffect(() => {
    const stored = loadActiveTest();
    if (!stored) {
      navigate("/build");
      return;
    }
    setActive(stored);
    setAnswers(stored.answers ?? {});
    setCurrentIndex(stored.currentIndex ?? 0);
  }, []);

  // Keep the saved copy in step with the answers and the question on screen,
  // so a refresh resumes exactly where the student was.
  useEffect(() => {
    if (!active || closedRef.current) return;

    try {
      saveActiveTest({ ...active, answers, currentIndex });
    } catch {
      // A full or unavailable store only costs resuming after a refresh. The
      // paper is still here in memory and still submits.
    }
  }, [active, answers, currentIndex]);

  const deadline = useMemo(() => {
    if (!active || active.test.settings.timeLimitMinutes === null) return null;
    return active.startedAt + active.test.settings.timeLimitMinutes * 60_000;
  }, [active]);

  const secondsLeft = deadline === null ? null : Math.round((deadline - now) / 1000);

  const handleSubmit = useCallback(
    async (reason: "manual" | "time-up") => {
      if (!active || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      setError(null);

      const payload: SubmittedAnswer[] = active.test.questions.map((question, index) => ({
        questionId: question.id,
        // The paper's own numbering, which survives the question being deleted
        // from the bank while this test is open.
        position: index,
        answer: answers[question.id] ?? ""
      }));

      const timeTakenSeconds = Math.max(0, Math.round((Date.now() - active.startedAt) / 1000));

      try {
        const result = await submitTest(active.test.id, payload, timeTakenSeconds);

        // The fresh result is shown from storage, comparison and all. If it
        // will not fit, the saved copy on the server is the way to it instead:
        // the submission has succeeded, and must not look as if it failed.
        let stored = true;
        try {
          saveLastResult({ ...result, subjectId: active.test.settings.subjectId });
        } catch {
          stored = false;
        }

        closedRef.current = true;
        clearActiveTest();
        navigate(stored ? "/results" : `/results/${active.test.id}`);
      } catch (cause) {
        const code = cause instanceof ApiError ? cause.code : null;

        // Already marked: the score exists, and the results screen is where the
        // student was trying to get to in the first place.
        if (code === "already-submitted") {
          closedRef.current = true;
          clearActiveTest();
          navigate(`/results/${active.test.id}`);
          return;
        }

        // Out of time: nothing was saved and nothing can be. Say so once and
        // offer the way out, rather than a retry button that cannot work and a
        // paper that cannot be left without an "are you sure".
        if (code === "time-expired") {
          closedRef.current = true;
          clearActiveTest();
          setSubmitting(false);
          setDead(true);
          setError((cause as Error).message);
          return;
        }

        // Anything else is a blip. Let them try again rather than losing the
        // paper to a dropped connection.
        submittedRef.current = false;
        setSubmitting(false);
        setError(
          reason === "time-up"
            ? `Time ran out but the test could not be sent: ${(cause as Error).message}`
            : (cause as Error).message
        );
      }
    },
    [active, answers]
  );

  // Drive the countdown off wall-clock time, so a backgrounded tab that stops
  // firing intervals still shows the right remaining time when it wakes up.
  useEffect(() => {
    if (deadline === null) return;

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [deadline]);

  // A hidden tab has its timers throttled to about once a minute, and can have
  // them suspended altogether. The deadline can therefore pass without the
  // interval noticing, and the paper arrives late enough for the server to
  // refuse it. Re-reading the clock the instant the tab is looked at again
  // sends it as soon as it possibly can be.
  useEffect(() => {
    if (deadline === null) return;

    function syncClock() {
      if (!document.hidden) setNow(Date.now());
    }

    document.addEventListener("visibilitychange", syncClock);
    window.addEventListener("focus", syncClock);
    return () => {
      document.removeEventListener("visibilitychange", syncClock);
      window.removeEventListener("focus", syncClock);
    };
  }, [deadline]);

  useEffect(() => {
    if (secondsLeft === null || secondsLeft > 0) return;
    if (autoSubmitRef.current || submittedRef.current) return;

    autoSubmitRef.current = true;
    void handleSubmit("time-up");
  }, [secondsLeft, handleSubmit]);

  // On a phone the question palette is a single scrolling strip rather than
  // fifty dots wrapped over seven rows, so moving through the paper has to drag
  // the current question back into view. Left alone, question 30 is reached by
  // a Next button that appears to do nothing.
  useEffect(() => {
    const strip = paletteRef.current;
    if (!strip) return;

    // Wide enough to show every dot at once: nothing to scroll, and asking for
    // it would only shove the page around.
    if (strip.scrollWidth <= strip.clientWidth) return;

    const dot = strip.querySelector<HTMLElement>(".palette-dot.current");
    if (!dot) return;

    // The strip is scrolled, rather than the dot asked to bring itself into
    // view: scrollIntoView walks every scrollable ancestor, so it would also
    // shift the page vertically to suit a bar that is already pinned in place.
    const stripBox = strip.getBoundingClientRect();
    const dotBox = dot.getBoundingClientRect();
    const centred =
      strip.scrollLeft + (dotBox.left - stripBox.left) - (strip.clientWidth - dotBox.width) / 2;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({
      left: Math.max(0, Math.min(centred, strip.scrollWidth - strip.clientWidth)),
      behavior: still ? "auto" : "smooth"
    });
  }, [currentIndex]);

  // Catch a tab close or a browser back mid-test.
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!submittedRef.current) event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  if (!active) {
    return <p>Loading your test...</p>;
  }

  const questions = active.test.questions;
  const question = questions[currentIndex];
  const answeredCount = questions.filter((item) => (answers[item.id] ?? "").trim().length > 0).length;
  const isLast = currentIndex === questions.length - 1;

  function goToQuestion(index: number) {
    setCurrentIndex(Math.max(0, Math.min(index, questions.length - 1)));
  }

  function setAnswer(value: string) {
    setAnswers((current) => ({ ...current, [question.id]: value }));
  }

  function confirmAndSubmit() {
    const unanswered = questions.length - answeredCount;
    if (
      unanswered > 0 &&
      !window.confirm(
        `${unanswered} question${unanswered === 1 ? " is" : "s are"} still unanswered. Submit anyway?`
      )
    ) {
      return;
    }
    void handleSubmit("manual");
  }

  return (
    <div className="exam-layout">
      <div className="exam-bar">
        <div className="exam-heading">
          <h1 className="exam-title">{active.test.title}</h1>
          <p className="exam-progress">
            Question {currentIndex + 1} of {questions.length} - {answeredCount} answered
          </p>
        </div>

        <div className={`exam-timer ${secondsLeft !== null && secondsLeft <= 60 ? "urgent" : ""}`}>
          {secondsLeft === null ? (
            <span className="timer-untimed">No time limit</span>
          ) : (
            <>
              <span className="timer-value">{formatClock(secondsLeft)}</span>
              <span className="timer-label">remaining</span>
            </>
          )}
        </div>
      </div>

      {active.short && (
        <p className="warning-banner">
          The question bank only had {questions.length} matching question
          {questions.length === 1 ? "" : "s"}, so this test is shorter than the {active.requestedCount}{" "}
          you asked for.
        </p>
      )}

      <div className="question-palette" ref={paletteRef} role="navigation" aria-label="Jump to question">
        {questions.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`palette-dot ${index === currentIndex ? "current" : ""} ${
              (answers[item.id] ?? "").trim().length > 0 ? "answered" : ""
            }`}
            onClick={() => goToQuestion(index)}
            aria-label={`Question ${index + 1}${
              (answers[item.id] ?? "").trim().length > 0 ? ", answered" : ", not answered"
            }`}
          >
            {index + 1}
          </button>
        ))}
      </div>

      <section className="question-card">
        <p className="question-meta">
          {topicName(question.subjectId, question.topicId)} - {question.difficulty}
          {" - "}
          <span className="question-marks">
            {question.marks} {question.marks === 1 ? "mark" : "marks"}
          </span>
        </p>

        <h2 className="question-prompt">{question.prompt}</h2>

        {question.imageUrl && (
          <img className="question-image" src={question.imageUrl} alt="Question diagram" />
        )}

        {question.type === "multiple-choice" ? (
          <div className="option-list">
            {question.options.map((option, index) => (
              <label
                // Keyed by position, not text: two options that read the same
                // are a duplicate React key, and the list stops re-rendering
                // reliably when the student moves between questions.
                key={`${question.id}-${index}`}
                className={`option ${answers[question.id] === option ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  checked={answers[question.id] === option}
                  onChange={() => setAnswer(option)}
                />
                <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                <span className="option-text">{option}</span>
              </label>
            ))}
          </div>
        ) : (
          <label className="short-answer">
            Your answer
            <input
              type="text"
              value={answers[question.id] ?? ""}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Type your answer"
              autoComplete="off"
            />
          </label>
        )}
      </section>

      {error && (
        <div className="error-banner exam-error" role="alert">
          <span>{error}</span>
          {dead ? (
            // This paper is finished with, one way or another. Offering to send
            // it again would be offering something that cannot happen.
            <>
              <button type="button" className="ghost-button" onClick={() => navigate("/history")}>
                Test history
              </button>
              <button type="button" className="ghost-button" onClick={() => navigate("/build")}>
                Start a new test
              </button>
            </>
          ) : (
            /* The only way back from a failed send. Without it a student whose
               time ran out on question three is stranded: the timer has had its
               one attempt and the finish button only appears on the last page. */
            <button
              type="button"
              className="ghost-button"
              onClick={() => void handleSubmit("manual")}
              disabled={submitting}
            >
              {submitting ? "Sending..." : "Try sending again"}
            </button>
          )}
        </div>
      )}

      <div className="exam-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={() => goToQuestion(currentIndex - 1)}
          disabled={currentIndex === 0}
        >
          Previous
        </button>

        {isLast ? (
          <button
            type="button"
            className="primary-button"
            onClick={confirmAndSubmit}
            disabled={submitting}
          >
            {submitting ? "Marking..." : "Finish and see results"}
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={() => goToQuestion(currentIndex + 1)}
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
