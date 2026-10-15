import { useEffect, useState } from "react";
import { handInLimits } from "@grade9/shared";
import { navigate } from "../app/router";
import { fill } from "../features/friends/fill";
import { clearActiveTest, loadActiveTest, type ActiveTest } from "../lib/examSession";
import { useLanguage } from "../lib/i18n";
import { paperTitle } from "../lib/testText";

/**
 * When the API stops taking a paper, or null for an untimed one, which it
 * always takes. A timed paper is taken until a minute past its limit. One this
 * tab handed in on time is taken for longer: as the retry of a hand-in whose
 * save failed, for a while after it was first sent (both in handInLimits).
 */
function closesAt(paper: ActiveTest): number | null {
  const limit = paper.test.settings.timeLimitMinutes;
  if (limit === null) return null;

  const graceEnds = paper.startedAt + limit * 60_000 + handInLimits.graceSeconds * 1000;
  const handedIn = paper.handedInAt;
  return handedIn !== undefined && handedIn <= graceEnds
    ? Math.max(graceEnds, handedIn + handInLimits.onTimeRetryMinutes * 60_000)
    : graceEnds;
}

/**
 * The way back to a test left part way through.
 *
 * Leaving a test keeps the paper and the answers in the tab, but nothing led
 * back to them: the only way in was typing #/exam, and starting a new test
 * replaced the old one without a word. The dashboard and the builder show this
 * whenever a paper is waiting, and say what starting another one does to it.
 *
 * A timed paper left until its time ran out is not offered. The API refuses
 * it, so resuming it only ever led to being told the time was up. The banner
 * says so at once instead, points to a new test, and forgets the paper. On the
 * builder (`inBuilder`) the new test is started right below, so it says that
 * rather than offering a button to the page it is on. A paper handed in on
 * time and left while it was being marked is still offered: if that hand-in
 * fails, resuming sends it again, and the API takes it.
 */
export function ResumeTestBanner({ inBuilder = false }: { inBuilder?: boolean }) {
  const { t, tn } = useLanguage();

  // Read once, as the page opens: the paper cannot change while this is on screen.
  const [paper] = useState(() => loadActiveTest());
  const [now, setNow] = useState(() => Date.now());
  const closing = paper === null ? null : closesAt(paper);
  const expired = closing !== null && now >= closing;

  // A banner left on screen while the time runs out stops offering the paper then.
  useEffect(() => {
    if (closing === null || expired) return;
    const timer = window.setTimeout(() => setNow(Date.now()), closing - Date.now());
    return () => window.clearTimeout(timer);
  }, [closing, expired, now]);

  // Nothing can be done with the paper now, so it is not kept to be met again
  // on the next visit. Only this paper: a new test started since has replaced it.
  useEffect(() => {
    if (expired && paper && loadActiveTest()?.test.id === paper.test.id) clearActiveTest();
  }, [expired, paper]);

  if (!paper) return null;

  // The paper's name in the site language, as the exam page shows it.
  const title = paperTitle(paper.test, t, tn);

  if (expired) {
    return (
      <section className="resume-banner" aria-label={t("exam.expiredTitle")}>
        <div>
          <strong>{t("exam.expiredTitle")}</strong>
          <p>
            {fill(t("exam.expiredBody"), { title })}
            {inBuilder && ` ${t("exam.expiredStartBelow")}`}
          </p>
        </div>

        {!inBuilder && (
          <button type="button" className="primary-button" onClick={() => navigate("/build")}>
            {t("exam.newTest")}
          </button>
        )}
      </section>
    );
  }

  const total = paper.test.questions.length;
  const answered = paper.test.questions.filter(
    (question) => (paper.answers[question.id] ?? "").trim().length > 0
  ).length;

  return (
    <section className="resume-banner" aria-label={t("exam.resumeTitle")}>
      <div>
        <strong>{t("exam.resumeTitle")}</strong>
        {/* Counted by the paper's length, since the noun after "of" agrees with
            it in Russian: "из 21 вопроса", "из 25 вопросов". */}
        <p>{tn("exam.resumeBody", total, { title, answered })}</p>
      </div>

      <button type="button" className="primary-button" onClick={() => navigate("/exam")}>
        {t("exam.resume")}
      </button>
    </section>
  );
}
