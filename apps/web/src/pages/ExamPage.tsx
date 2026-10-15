import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SubmittedAnswer, TestResult } from "@grade9/shared";
import { writtenAnswerMaxLength } from "@grade9/shared";
import { navigate, replaceRoute, setLeaveGuard } from "../app/router";
import { useAuth } from "../features/auth/AuthContext";
import { SignInToFinishButton } from "../features/auth/SignInToFinishButton";
import { fill } from "../features/friends/fill";
import {
  clearActiveTest,
  loadActiveTest,
  markHandedIn,
  saveLastResult,
  saveProgress,
  type ActiveTest
} from "../lib/examSession";
import { useLanguage } from "../lib/i18n";
import { difficultyLabel, formatCount, paperTitle, testErrorText, topicLabel } from "../lib/testText";
import { ApiError } from "../services/apiClient";
import { submitTest } from "../services/testsApi";

/**
 * Refusals that no amount of resending changes: out of time, or a paper that
 * is not this student's (a 403) or no longer exists (a 404, as after an API
 * in memory mode restarts). Offering "try again" for these only strands the
 * student on a paper they cannot put down.
 */
function isFinalRefusal(cause: unknown): boolean {
  if (!(cause instanceof ApiError)) return false;
  return cause.code === "time-expired" || cause.status === 403 || cause.status === 404;
}

/**
 * Another hand-in of this paper is still being marked: one sent before a
 * reload, or from another tab. It can still fail and leave the paper open, so
 * this is not "already handed in", and the paper must not be put down yet.
 */
function isStillMarking(cause: unknown): boolean {
  return cause instanceof ApiError && cause.code === "submission-in-progress";
}

/**
 * How often a paper that is still being marked elsewhere is sent again, and
 * for how long at most. Marking written answers can take a few minutes (the
 * marker is given up to three for each), so the wait covers that; after it
 * the usual "try sending again" is offered, with the paper still here. Each
 * send either finds the other hand-in finished, and so the result, or the
 * paper open again after it failed, and hands it in for real.
 */
const STILL_MARKING_RETRY_MS = 3000;
const STILL_MARKING_MAX_WAIT_MS = 4 * 60_000;

/** Words as a teacher would count them: runs of letters or digits, in any script. */
function wordCount(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

/**
 * How long a written answer gets before its length is shown against the limit.
 * Most answers are a few hundred characters, and a count of those out of
 * 4,000 would only be in the way.
 */
const LENGTH_SHOWN_FROM = 0.8 * writtenAnswerMaxLength;

/**
 * Whether cutting `text` at `index` would split a character written as two
 * UTF-16 units, as an emoji is, and leave the answer ending in half of one.
 */
function splitsCharacter(text: string, index: number): boolean {
  const unit = text.charCodeAt(index - 1);
  return unit >= 0xd800 && unit <= 0xdbff;
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function ExamPage() {
  const { language, t, tn } = useLanguage();
  const { user } = useAuth();
  const [active, setActive] = useState<ActiveTest | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  // The question whose written answer a paste or typing last took over the
  // length limit, so the note saying it was cut shows under that one.
  const [cutQuestion, setCutQuestion] = useState<string | null>(null);

  const [now, setNow] = useState(() => Date.now());
  // The failure, and whether the timer sent it, rather than a sentence: the
  // sentence is put together when shown, in whatever language the site is in.
  const [error, setError] = useState<{ cause: unknown; timeUp: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Set while the paper waits for another hand-in of it to finish marking
  // (see isStillMarking), so the student is told why nothing has happened yet.
  const [stillMarking, setStillMarking] = useState(false);

  // Set when the server will never accept this paper, however many times it is
  // offered. Retrying is then the one thing not to suggest.
  const [dead, setDead] = useState(false);

  // Auto-submit and a manual click can race; this makes sure only one wins.
  const submittedRef = useRef(false);

  // Whether this page is still open. A paper waiting to be sent again is not
  // sent again once the student has gone elsewhere, minutes later and from a
  // page they left: it stays saved, for the builder to offer to resume.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Set once the paper is over - marked, found already marked, or out of time -
  // and its saved copy cleared. Saving after that would put a finished paper
  // back, to be reopened on the next visit to this page.
  const closedRef = useRef(false);

  const paletteRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const stillMarkingRef = useRef<HTMLParagraphElement>(null);

  /*
   * The question's own heading, and whether the student has just asked for a
   * different question. Next, Previous and the palette used to swap the
   * question under a focus that stayed on the button, so a screen reader said
   * nothing at all and the student had to go back up to find out what was
   * now being asked. Only a move the student makes counts: resuming a paper
   * after a refresh restores the question without taking focus.
   */
  const promptRef = useRef<HTMLHeadingElement>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    if (!movedRef.current) return;
    movedRef.current = false;
    promptRef.current?.focus({ preventScroll: true });
    promptRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentIndex]);

  // The countdown fires once when it reaches zero and then leaves it alone.
  // Without this the timer retries the same failing request on every tick, so a
  // test the server will not accept turns into a request a second, for as long
  // as the page is left open. One attempt, then a button.
  const autoSubmitRef = useRef(false);

  useEffect(() => {
    const stored = loadActiveTest();
    // Nothing to sit, so this address is swapped for the builder rather than
    // left in the history: Back from the results of a finished test lands
    // here, and adding a step each time made it a trap that never went further.
    if (!stored) {
      replaceRoute("/build");
      return;
    }
    setActive(stored);
    setAnswers(stored.answers);
    setCurrentIndex(stored.currentIndex);
  }, []);

  // Keep the saved progress in step with the answers and the question on
  // screen, so a refresh resumes exactly where the student was.
  useEffect(() => {
    if (!active || closedRef.current) return;

    try {
      saveProgress(active.test.id, answers, currentIndex);
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

      // Noted on the saved paper before it goes. A timed paper taken in on
      // time is taken again after its time runs out, as the retry of a hand-in
      // whose save failed, so the resume banner keeps offering it after this.
      markHandedIn(active.test.id, Date.now());

      const payload: SubmittedAnswer[] = active.test.questions.map((question, index) => ({
        questionId: question.id,
        // The paper's own numbering, which survives the question being deleted
        // from the bank while this test is open.
        position: index,
        // Cut to what the API accepts. The boxes keep to it, but an answer
        // can also come back from saved progress, and one too long gets the
        // whole paper refused on every retry.
        answer: (answers[question.id] ?? "").slice(0, writtenAnswerMaxLength)
      }));

      const timeTakenSeconds = Math.max(0, Math.round((Date.now() - active.startedAt) / 1000));
      const giveUpAt = Date.now() + STILL_MARKING_MAX_WAIT_MS;

      // Sends the paper, and sends it again while another hand-in of it is
      // still being marked. Only a result, or an answer that settles it one
      // way or the other, comes out of here.
      const send = async (): Promise<TestResult> => {
        for (;;) {
          try {
            return await submitTest(active.test.id, payload, timeTakenSeconds);
          } catch (cause) {
            if (!isStillMarking(cause) || Date.now() >= giveUpAt || !mountedRef.current) throw cause;
            setStillMarking(true);
            await new Promise((resolve) => window.setTimeout(resolve, STILL_MARKING_RETRY_MS));
            if (!mountedRef.current) throw cause;
          }
        }
      };

      try {
        const result = await send();
        setStillMarking(false);

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
        // This paper only, and on to its results only from its own page. A
        // student who left while it was being marked may have started another
        // test since, which clearing whatever was saved wiped, and been taken
        // out of it to these results.
        clearActiveTest(active.test.id);
        // The finished paper's step becomes the results, so Back from them
        // goes to the builder and not to a paper that no longer exists.
        if (mountedRef.current) replaceRoute(stored ? "/results" : `/results/${active.test.id}`);
      } catch (cause) {
        setStillMarking(false);
        const code = cause instanceof ApiError ? cause.code : null;

        // Already marked and saved: the score exists, and the results screen is
        // where the student was trying to get to in the first place. Only this
        // answer puts the paper down; "still being marked" never does, since
        // that hand-in can still fail (see isStillMarking).
        if (code === "already-submitted") {
          closedRef.current = true;
          clearActiveTest(active.test.id);
          if (mountedRef.current) replaceRoute(`/results/${active.test.id}`);
          return;
        }

        // Out of time, or a paper the server will never take from this
        // student: nothing was saved and nothing can be. Say so once and offer
        // the way out, rather than a retry button that cannot work and a paper
        // that cannot be left without an "are you sure".
        if (isFinalRefusal(cause)) {
          closedRef.current = true;
          clearActiveTest(active.test.id);
          setSubmitting(false);
          setDead(true);
          setError({ cause, timeUp: false });
          return;
        }

        // Anything else is a blip, including a paper still being marked
        // elsewhere after the wait in send(). Let them try again rather than
        // losing the paper to a dropped connection.
        submittedRef.current = false;
        setSubmitting(false);
        setError({ cause, timeUp: reason === "time-up" });
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

  // A reload or a closed tab: the browser asks, in its own words. Leaving for
  // another page of the app never unloads it, so that is the guard's below.
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!submittedRef.current) event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // Leaving by Back, by the logo or by typing another address asks first while
  // the paper is open. The paper is kept whatever the answer, and the dashboard
  // and the builder offer to resume it, so the question says that rather than
  // claiming the answers are lost. A timed paper also says its clock goes on:
  // the time is the server's, counted from when the test was made. A guest
  // has no dashboard (the home page is the landing page), so their question
  // names only the builder.
  const timed = active !== null && active.test.settings.timeLimitMinutes !== null;
  const leaveText =
    active === null
      ? null
      : user
        ? t(timed ? "exam.leaveConfirmTimed" : "exam.leaveConfirm")
        : t(timed ? "exam.leaveConfirmGuestTimed" : "exam.leaveConfirmGuest");

  useEffect(() => {
    if (leaveText === null) return;
    return setLeaveGuard((to) => to === "/exam" || closedRef.current || window.confirm(leaveText));
  }, [leaveText]);

  // On a phone the error sits under the question, behind the sticky
  // Previous/Finish bar, so a failed submit looked like a button that did
  // nothing. Centred, it clears the bar.
  useEffect(() => {
    if (!error) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    errorRef.current?.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  }, [error]);

  // The same for the line saying the paper is waiting on another hand-in, which
  // appears where the error would.
  useEffect(() => {
    if (!stillMarking) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stillMarkingRef.current?.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  }, [stillMarking]);

  if (!active) {
    // A status, like every other loading line, so it is read out.
    return <p role="status">{t("exam.loading")}</p>;
  }

  const questions = active.test.questions;
  const question = questions[currentIndex];
  const answeredCount = questions.filter((item) => (answers[item.id] ?? "").trim().length > 0).length;
  const isLast = currentIndex === questions.length - 1;
  const written = answers[question.id] ?? "";
  const cut = cutQuestion === question.id;

  function goToQuestion(index: number) {
    const next = Math.max(0, Math.min(index, questions.length - 1));
    if (next === currentIndex) return;
    movedRef.current = true;
    setCurrentIndex(next);
  }

  // A paper the server has refused is closed: its answers can no longer
  // change, and Finish is gone (see below). It stayed editable, so a student
  // could keep answering and press Finish, be asked "Submit anyway?", and then
  // see nothing happen at all.
  function setAnswer(value: string) {
    if (dead) return;
    setAnswers((current) => ({ ...current, [question.id]: value }));
  }

  /*
   * A written answer as typed or pasted, kept to the most the API accepts.
   *
   * The box used to stop at the limit by itself (maxLength), which cut a long
   * paste short without a word: the box looked full, and nothing said that the
   * end of the paste was missing. The cut is made here instead, so the student
   * can be told. As with maxLength, what goes is the end of what was just
   * added, which finishes at the caret: what was already written stays.
   */
  function setWrittenAnswer(box: HTMLTextAreaElement) {
    const typed = box.value;
    const over = typed.length - writtenAnswerMaxLength;

    if (over <= 0) {
      // The note stays with its answer until that answer is changed.
      setCutQuestion((current) => (current === question.id ? null : current));
      setAnswer(typed);
      return;
    }

    // An answer that was over the limit already (one saved by an older build)
    // has no added part to take from, so it keeps its beginning instead.
    const caret = box.selectionEnd;
    const fromAdded = caret >= over && (answers[question.id] ?? "").length <= writtenAnswerMaxLength;
    let cutAt = fromAdded ? caret - over : writtenAnswerMaxLength;
    if (splitsCharacter(typed, cutAt)) cutAt -= 1;
    const kept = fromAdded ? typed.slice(0, cutAt) + typed.slice(caret) : typed.slice(0, cutAt);

    // Put in the box here rather than left for React to, which would move the
    // caret to the very end of the answer, away from where the student was.
    box.value = kept;
    box.setSelectionRange(cutAt, cutAt);

    setCutQuestion(question.id);
    setAnswer(kept);
  }

  function confirmAndSubmit() {
    if (dead) return;

    const unanswered = questions.length - answeredCount;
    if (unanswered > 0 && !window.confirm(tn("exam.confirmUnanswered", unanswered))) {
      return;
    }
    void handleSubmit("manual");
  }

  // The banner's sentence. A send the timer made that failed says so first,
  // since otherwise the student only sees the reason and not what it stopped.
  const errorText =
    error === null
      ? null
      : error.timeUp
        ? fill(t("exam.timeUpFailed"), { reason: testErrorText(error.cause, t) })
        : testErrorText(error.cause, t);

  return (
    <div className="exam-layout">
      <div className="exam-bar">
        <div className="exam-heading">
          <h1 className="exam-title">{paperTitle(active.test, t, tn)}</h1>
          <p className="exam-progress">
            {fill(t("exam.progress"), {
              current: String(currentIndex + 1),
              total: String(questions.length),
              answered: String(answeredCount)
            })}
          </p>
        </div>

        <div className={`exam-timer ${secondsLeft !== null && secondsLeft <= 60 ? "urgent" : ""}`}>
          {secondsLeft === null ? (
            <span className="timer-untimed">{t("exam.untimed")}</span>
          ) : (
            <>
              <span className="timer-value">{formatClock(secondsLeft)}</span>
              <span className="timer-label">{t("exam.remaining")}</span>
            </>
          )}
        </div>
      </div>

      {active.short && (
        <p className="warning-banner">
          {fill(t("exam.short"), {
            questions: tn("count.questions", questions.length),
            requested: String(active.requestedCount)
          })}
        </p>
      )}

      <div className="question-palette" ref={paletteRef} role="navigation" aria-label={t("exam.palette")}>
        {questions.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`palette-dot ${index === currentIndex ? "current" : ""} ${
              (answers[item.id] ?? "").trim().length > 0 ? "answered" : ""
            }`}
            onClick={() => goToQuestion(index)}
            aria-label={fill(
              t((answers[item.id] ?? "").trim().length > 0 ? "exam.dotAnswered" : "exam.dotUnanswered"),
              { n: String(index + 1) }
            )}
          >
            {index + 1}
          </button>
        ))}
      </div>

      <section className="question-card">
        <p className="question-meta">
          {topicLabel(t, question.subjectId, question.topicId)} - {difficultyLabel(t, question.difficulty)}
          {" - "}
          <span className="question-marks">{tn("count.marks", question.marks)}</span>
        </p>

        {/* The question itself is never translated here. The API has already
            put maths into the site language where a translation exists, and an
            English or Russian question stays in the language it is testing. */}
        {/* Focusable by script only (see promptRef), and read with the
            question's number first, so moving to it says where the student is. */}
        <h2 className="question-prompt route-focus" ref={promptRef} tabIndex={-1}>
          <span className="visually-hidden">
            {fill(t("exam.questionNumber"), { n: String(currentIndex + 1), total: String(questions.length) })}
          </span>
          {question.prompt}
        </h2>

        {question.imageUrl && (
          <img className="question-image" src={question.imageUrl} alt={t("exam.diagram")} />
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
                  disabled={dead}
                  onChange={() => setAnswer(option)}
                />
                <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                <span className="option-text">{option}</span>
              </label>
            ))}
          </div>
        ) : question.type === "open-ended" ? (
          <div className="form-field">
            <label className="short-answer written-answer">
              {t("exam.yourAnswer")}
              <textarea
                value={written}
                disabled={dead}
                onChange={(event) => setWrittenAnswer(event.currentTarget)}
                placeholder={t("exam.writtenPlaceholder")}
                rows={8}
                aria-describedby={cut ? "written-answer-cut" : undefined}
              />
              {/* Tasks set a minimum ("at least 35 words"), so show the count.
                  The length joins it near the limit, before anything is cut. */}
              <span className="written-answer-count">
                {tn("count.words", wordCount(written))}
                {written.length >= LENGTH_SHOWN_FROM &&
                  ` · ${tn("exam.charCount", writtenAnswerMaxLength, {
                    used: formatCount(written.length, language),
                    max: formatCount(writtenAnswerMaxLength, language)
                  })}`}
              </span>
            </label>

            {/* Outside the label, which would otherwise read it out as part of
                the box's name. A status, so it is read out when it appears. */}
            {cut && (
              <p className="warning-banner" id="written-answer-cut" role="status">
                {tn("exam.answerCut", writtenAnswerMaxLength, { max: formatCount(writtenAnswerMaxLength, language) })}
              </p>
            )}
          </div>
        ) : (
          <label className="short-answer">
            {t("exam.yourAnswer")}
            <input
              type="text"
              value={answers[question.id] ?? ""}
              disabled={dead}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder={t("exam.shortPlaceholder")}
              autoComplete="off"
              // The API refuses any answer longer than this, short ones too,
              // and refuses the whole paper with it: one long paste here made
              // every send fail with no hint of which answer was at fault.
              maxLength={writtenAnswerMaxLength}
            />
          </label>
        )}
      </section>

      {/* A status rather than an alert: nothing has gone wrong, and the paper
          is sent again on its own. */}
      {stillMarking && (
        <p className="warning-banner" role="status" ref={stillMarkingRef}>
          {t("exam.stillMarking")}
        </p>
      )}

      {errorText && (
        <div className="error-banner exam-error" role="alert" ref={errorRef}>
          <span>{errorText}</span>
          {dead ? (
            // This paper is finished with, one way or another. Offering to send
            // it again would be offering something that cannot happen.
            <>
              <button type="button" className="ghost-button" onClick={() => navigate("/history")}>
                {t("main.history")}
              </button>
              <button type="button" className="ghost-button" onClick={() => navigate("/build")}>
                {t("exam.newTest")}
              </button>
            </>
          ) : (
            <>
              {/* A session the server no longer accepts: sending again cannot
                  work until the student signs in again, and this keeps the
                  paper through that. */}
              {error?.cause instanceof ApiError && error.cause.status === 401 && (
                <SignInToFinishButton
                  paper={{ ...active, answers, currentIndex }}
                  onLeave={() => {
                    closedRef.current = true;
                  }}
                />
              )}
              {/* The only way back from a failed send. Without it a student whose
                 time ran out on question three is stranded: the timer has had its
                 one attempt and the finish button only appears on the last page. */}
              <button
                type="button"
                className="ghost-button"
                onClick={() => void handleSubmit("manual")}
                disabled={submitting}
              >
                {submitting ? t("exam.sending") : t("exam.retry")}
              </button>
            </>
          )}
        </div>
      )}

      {/* Once the paper is refused for good, the only way on is the pair of
          buttons in the message above, so the paper's own buttons go. */}
      {!dead && (
        <div className="exam-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => goToQuestion(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            {t("exam.previous")}
          </button>

          {isLast ? (
            <button
              type="button"
              className="primary-button"
              onClick={confirmAndSubmit}
              disabled={submitting}
            >
              {submitting ? t("exam.marking") : t("exam.finish")}
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={() => goToQuestion(currentIndex + 1)}
            >
              {t("exam.next")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
