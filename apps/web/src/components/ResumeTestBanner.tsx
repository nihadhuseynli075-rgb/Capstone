import { useState } from "react";
import { navigate } from "../app/router";
import { loadActiveTest } from "../lib/examSession";
import { fill, useLanguage } from "../lib/i18n";
import { paperTitle } from "../lib/testText";

/**
 * The way back to a test left part way through.
 *
 * Leaving a test keeps the paper and the answers in the tab, but nothing led
 * back to them: the only way in was typing #/exam, and starting a new test
 * replaced the old one without a word. The dashboard and the builder show this
 * whenever a paper is waiting, and say what starting another one does to it.
 */
export function ResumeTestBanner() {
  const { t, tn } = useLanguage();

  // Read once, as the page opens: the paper cannot change while this is on screen.
  const [paper] = useState(() => loadActiveTest());
  if (!paper) return null;

  const total = paper.test.questions.length;
  const answered = paper.test.questions.filter(
    (question) => (paper.answers[question.id] ?? "").trim().length > 0
  ).length;

  return (
    <section className="resume-banner" aria-label={t("exam.resumeTitle")}>
      <div>
        <strong>{t("exam.resumeTitle")}</strong>
        {/* The paper's name in the site language, as the exam page shows it. */}
        <p>{fill(t("exam.resumeBody"), { title: paperTitle(paper.test, t, tn), answered, total })}</p>
      </div>

      <button type="button" className="primary-button" onClick={() => navigate("/exam")}>
        {t("exam.resume")}
      </button>
    </section>
  );
}
