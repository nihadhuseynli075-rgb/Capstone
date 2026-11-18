import { useEffect, useId, useState } from "react";
import type { SubjectId } from "@grade9/shared";
import { navigate } from "../app/router";
import { useLanguage, type TranslationKey } from "../lib/i18n";
import { sectorNote } from "../lib/testText";
import { fetchCatalog } from "../services/testsApi";

/**
 * The subjects as shortcuts into the builder. Each has a glyph a student knows
 * before reading the label: pi for maths, and each language's own letters.
 */
const subjectShortcuts: Array<{ id: SubjectId; glyph: string; label: TranslationKey }> = [
  { id: "math", glyph: "π", label: "subject.math" },
  { id: "english", glyph: "Aa", label: "subject.english" },
  { id: "russian", glyph: "Яя", label: "subject.russian" },
  { id: "azerbaijani", glyph: "Əə", label: "subject.azerbaijani" }
];

/**
 * Used on the signed-in home (cards) and on the landing page, where the
 * subjects are stops on one trail (`variant="trail"`, styled in landing.css):
 * a ridge line joins the glyph markers, and a subject with nothing in it yet
 * is a dashed stop with "Coming soon".
 */
export function SubjectShortcuts({
  className = "",
  variant = "cards"
}: {
  className?: string;
  variant?: "cards" | "trail";
}) {
  const { t } = useLanguage();
  const titleId = useId();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  // How many questions each subject has. Not worth a banner if it fails: the
  // shortcuts still work, just without their counts.
  useEffect(() => {
    let active = true;

    fetchCatalog()
      .then((subjects) => {
        if (active) setCounts(Object.fromEntries(subjects.map((item) => [item.id, item.total])));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className={`subject-shortcuts ${className}`} aria-labelledby={titleId}>
      <h2 id={titleId} className="subject-shortcuts-title">
        {t("main.subjectsTitle")}
      </h2>

      <div className={`subject-grid ${variant === "trail" ? "subject-trail" : ""}`}>
        {subjectShortcuts.map((subject, index) => {
          // Unknown until the catalog answers. A subject is only switched off
          // once the bank has confirmed there is nothing in it, so a slow or
          // failed request never blocks a shortcut that would have worked.
          const count = counts?.[subject.id];
          const empty = count === 0;
          const sector = sectorNote(t, subject.id);

          if (variant === "trail") {
            const next = subjectShortcuts[index + 1];
            // The way on to a stop still to come is dashed, like the stop.
            const nextEmpty = next ? counts?.[next.id] === 0 : false;

            return (
              <button
                key={subject.id}
                type="button"
                className={`subject-stop ${empty ? "is-soon" : ""}`}
                disabled={empty}
                onClick={() => navigate(`/build?subject=${subject.id}`)}
              >
                <span className="subject-glyph" aria-hidden="true">
                  {subject.glyph}
                </span>
                {/* The ridge on to the next stop: across on a wide screen,
                    down between the rows on a narrow one. */}
                {next && (
                  <>
                    <svg className={`trail-seg is-across ${nextEmpty ? "is-dashed" : ""}`} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                      <path d="M0,30 L50,6 L100,30" vectorEffect="non-scaling-stroke" />
                    </svg>
                    <svg className={`trail-seg is-down ${nextEmpty ? "is-dashed" : ""}`} viewBox="0 0 40 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                      <path d="M20,0 L30,50 L20,100" vectorEffect="non-scaling-stroke" />
                    </svg>
                  </>
                )}
                <span className="subject-stop-text">
                  <span className="subject-name">{t(subject.label)}</span>
                  <span className="subject-meta">
                    {count !== undefined && (
                      <span className="subject-count">{empty ? t("main.soon") : count}</span>
                    )}
                    {sector && <span className="subject-sector">{sector}</span>}
                  </span>
                </span>
              </button>
            );
          }

          return (
            <button
              key={subject.id}
              type="button"
              className="subject-card"
              disabled={empty}
              onClick={() => navigate(`/build?subject=${subject.id}`)}
            >
              <span className="subject-glyph" aria-hidden="true">
                {subject.glyph}
              </span>
              <span className="subject-name">{t(subject.label)}</span>
              {/* Which sector the paper is for, so a student does not take the
                  other sector's language paper for their own. */}
              {sector && <span className="subject-sector">{sector}</span>}
              {count !== undefined && (
                <span className="subject-count">{empty ? t("main.soon") : count}</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
