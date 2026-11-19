import { MIN_ACCOUNT_AGE, latestAccountBirthYear } from "@grade9/shared";
import { PageBand } from "../components/PageBand";
import { fill, useLanguage } from "../lib/i18n";
import { contactAddress, legalTexts, whoRunsLine } from "../lib/legalText";

/**
 * The privacy page and the terms of use, in the site language.
 *
 * Accounts are made by Grade 9 students, so what is kept about them, who sees
 * it and how to delete it has to be written down somewhere they can find it:
 * the footer, the landing page and the sign-up form all link here. Open to
 * guests, like the other app pages.
 *
 * The texts are still a draft (see legalText.ts), but the page does not say
 * so: it is public, and a draft marker or a placeholder address is not
 * something a visitor should meet. Paragraphs that need the contact address
 * wait, unseen, until there is one.
 */
export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { t, language } = useLanguage();
  const texts = legalTexts[language];
  const page = texts[kind];
  // Who runs the site, in Nihad's words (legalText.ts); left out until he gives it.
  const whoRuns = whoRunsLine(language);

  /**
   * A paragraph, with the age rule's figures put in, and the contact address
   * as a link wherever it is named. The figures come from MIN_ACCOUNT_AGE in
   * packages/shared, which sign-up checks against, so the page and what it
   * describes cannot drift apart.
   */
  function renderParagraph(raw: string) {
    const text = fill(raw, { age: MIN_ACCOUNT_AGE, year: latestAccountBirthYear() });
    if (!contactAddress) return text;
    const parts = text.split("{contact}");

    return parts.map((part, index) => (
      <span key={index}>
        {part}
        {index < parts.length - 1 && <a href={`mailto:${contactAddress}`}>{contactAddress}</a>}
      </span>
    ));
  }

  /** The paragraphs that can be shown: without an address, none that need one. */
  function shown(paragraphs: string[]): string[] {
    return contactAddress ? paragraphs : paragraphs.filter((paragraph) => !paragraph.includes("{contact}"));
  }

  // A section left with nothing to say (the "Questions" one, until there is an
  // address) goes too, rather than standing as a heading over nothing.
  const sections = page.sections
    .map((section) => ({ ...section, paragraphs: shown(section.paragraphs) }))
    .filter((section) => section.paragraphs.length > 0);

  // The page opens with the navy band and ridge over its own title and intro
  // (PageBand); the sections keep their narrow reading column underneath.
  return (
    <article className="stack legal-page">
      <PageBand title={page.title} intro={page.intro} />

      <div className="stack narrow legal-body">
        <p className="legal-updated">{texts.updated}</p>
        {whoRuns && (
          <p className="legal-operator" lang={whoRuns.language === language ? undefined : whoRuns.language}>
            {whoRuns.text}
          </p>
        )}

        {sections.map((section) => (
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
      </div>
    </article>
  );
}
