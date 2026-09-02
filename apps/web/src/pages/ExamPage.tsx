import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SubmittedAnswer } from "@grade9/shared";
import { topicName } from "@grade9/shared";
import { navigate } from "../app/router";
import { clearActiveTest, loadActiveTest, saveLastResult, type ActiveTest } from "../lib/examSession";
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

  // Auto-submit and a manual click can race; this makes sure only one wins.
  const submittedRef = useRef(false);

  useEffect(() => {
    const stored = loadActiveTest();
    if (!stored) {
      navigate("/build");
      return;
    }
    setActive(stored);
  }, []);

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

      const payload: SubmittedAnswer[] = active.test.questions.map((question) => ({
        questionId: question.id,
        answer: answers[question.id] ?? ""
      }));

      const timeTakenSeconds = Math.max(0, Math.round((Date.now() - active.startedAt) / 1000));

      try {
        const result = await submitTest(active.test.id, payload, timeTakenSeconds);
        saveLastResult(result);
        clearActiveTest();
        navigate("/results");
      } catch (cause) {
        // Let them try again rather than losing the paper to a network blip.
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

  useEffect(() => {
    if (secondsLeft !== null && secondsLeft <= 0 && !submittedRef.current) {
      void handleSubmit("time-up");
    }
  }, [secondsLeft, handleSubmit]);

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
        <div>
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

      <div className="question-palette" role="navigation" aria-label="Jump to question">
        {questions.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`palette-dot ${index === currentIndex ? "current" : ""} ${
              (answers[item.id] ?? "").trim().length > 0 ? "answered" : ""
            }`}
            onClick={() => setCurrentIndex(index)}
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
        </p>

        <h2 className="question-prompt">{question.prompt}</h2>

        {question.imageUrl && (
          <img className="question-image" src={question.imageUrl} alt="Question diagram" />
        )}

        {question.type === "multiple-choice" ? (
          <div className="option-list">
            {question.options.map((option, index) => (
              <label
                key={option}
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

      {error && <p className="error-banner">{error}</p>}

      <div className="exam-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
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
            onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
