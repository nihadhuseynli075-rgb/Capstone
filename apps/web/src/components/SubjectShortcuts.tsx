import { useEffect, useId, useState } from "react";
import type { SubjectId } from "@grade9/shared";
import { navigate } from "../app/router";
import { useLanguage, type TranslationKey } from "../lib/i18n";
import { fetchCatalog } from "../services/testsApi";

/**
 * The subjects as shortcuts into the builder. Each has a glyph a student knows
 * before reading the label: pi for maths, and each language's own letters.
 */
const subjectShortcuts: Array<{ id: SubjectId; glyph: string; label: TranslationKey }> = [
  { id: "math", glyph: "π", label: "subject.math" },
  { id: "english", glyph: "Aa", label: "subject.english" },
  { id: "russian", glyph: "Яя", label: "subject.russian" }
];

/**
 * Used on the signed-in home and on the landing page, which restyles it for
 * its dark background through `className`.
 */
export function SubjectShortcuts({ className = "" }: { className?: string }) {
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

      <div className="subject-grid">
        {subjectShortcuts.map((subject) => {
          // Unknown until the catalog answers. A subject is only switched off
          // once the bank has confirmed there is nothing in it, so a slow or
          // failed request never blocks a shortcut that would have worked.
          const count = counts?.[subject.id];
          const empty = count === 0;

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
