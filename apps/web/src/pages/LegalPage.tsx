import { useLanguage } from "../lib/i18n";
import { legalTexts } from "../lib/legalText";

/**
 * The privacy page and the terms of use, in the site language.
 *
 * Accounts are made by Grade 9 students, so what is kept about them, who sees
 * it and how to delete it has to be written down somewhere they can find it:
 * the footer, the landing page and the sign-up form all link here. Open to
 * guests, like the other app pages.
 */
export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { t, language } = useLanguage();
  const texts = legalTexts[language];
  const page = texts[kind];

  /** A paragraph, with the missing contact address shown as a marked placeholder. */
  function renderParagraph(text: string) {
    const parts = text.split("{contact}");

    return parts.map((part, index) => (
      <span key={index}>
        {part}
        {index < parts.length - 1 && <mark className="legal-placeholder">{texts.contactPlaceholder}</mark>}
      </span>
    ));
  }

  return (
    <article className="stack narrow legal-page">
      {/* Not a finished text yet, and it must not read as one. */}
      <p className="warning-banner" role="note">
        {texts.draftNote}
      </p>

      <section>
        <h1>{page.title}</h1>
        <p className="lede">{page.intro}</p>
        <p className="legal-updated">{texts.updated}</p>
      </section>

      {page.sections.map((section) => (
        <section key={section.heading} className="panel legal-section">
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{renderParagraph(paragraph)}</p>
          ))}
        </section>
      ))}

      <p className="legal-other">
        <a href={kind === "privacy" ? "#/terms" : "#/privacy"}>
          {kind === "privacy" ? t("legal.terms") : t("legal.privacy")}
        </a>
      </p>
    </article>
  );
}
