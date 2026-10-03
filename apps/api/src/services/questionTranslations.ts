import type { BankQuestion, QuestionTranslation, QuestionTranslations, SiteLanguage } from "@grade9/shared";
import { followsSiteLanguage, siteLanguages, subjectName } from "@grade9/shared";

/**
 * Questions in the student's language.
 *
 * A question keeps its own text as the source of truth and may carry other
 * languages in `translations`. Nothing here cares which language the question's
 * own text is in: a translation is used when the student's language has one, and
 * the question's own text is used otherwise.
 *
 * The one rule about options is that a translated list is read by position. The
 * bank stores the correct answer as text, so serving translated options with the
 * original answer would mark every right choice wrong. Instead the correct option
 * is taken from the translated list at the position the original sits in, and
 * that is what gets copied onto the attempt for marking.
 */

export const languageNames: Record<SiteLanguage, string> = {
  en: "English",
  ru: "Russian",
  az: "Azerbaijani"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Translations as they come out of the database.
 *
 * The column only guarantees a JSON object (migration 0010); the rest is written
 * by hand in the SQL editor, so anything that does not fit is left out rather
 * than trusted. An entry with no question text, or with options that are not a
 * list of strings, is skipped whole: a half-read translation would put one
 * language's question over another's choices.
 */
export function readTranslations(raw: unknown): QuestionTranslations {
  if (!isRecord(raw)) return {};

  const translations: QuestionTranslations = {};

  for (const language of siteLanguages) {
    const entry = raw[language];
    if (!isRecord(entry)) continue;
    if (typeof entry.prompt !== "string" || entry.prompt.trim().length === 0) continue;

    const translation: QuestionTranslation = { prompt: entry.prompt };

    if (entry.options !== undefined && entry.options !== null) {
      if (!Array.isArray(entry.options) || !entry.options.every((option) => typeof option === "string")) continue;
      translation.options = entry.options;
    }
    if (typeof entry.explanation === "string") translation.explanation = entry.explanation;
    if (typeof entry.correctAnswer === "string") translation.correctAnswer = entry.correctAnswer;

    translations[language] = translation;
  }

  return translations;
}

type ChoiceQuestion = Pick<BankQuestion, "options" | "correctAnswer">;

/**
 * The translated options of a multiple choice question, with the translated
 * correct option picked out by position. Null when the translation brings no
 * options of its own, which means the question's are used as they are.
 *
 * `problem` says why a list cannot be trusted. Serving and saving both ask this,
 * so a list that is refused when it is saved is also never served.
 */
function translatedChoices(
  question: ChoiceQuestion,
  translation: QuestionTranslation
): { options: string[]; correctAnswer: string } | { problem: string } | null {
  const options = translation.options;
  if (!options || options.length === 0) return null;

  if (options.length !== question.options.length) {
    return {
      problem: `has ${options.length} options but the question has ${question.options.length}. They must be in the same order, one for one`
    };
  }

  if (options.some((option) => option.trim().length === 0)) {
    return { problem: "has an empty option" };
  }

  const correctIndex = question.options.indexOf(question.correctAnswer);
  if (correctIndex === -1) {
    return { problem: "cannot be matched up because the question's correct answer is not one of its options" };
  }

  const correctAnswer = options[correctIndex];

  // Two options reading the same would let a wrong choice match the right one,
  // since marking compares the text that was picked.
  if (options.filter((option) => option === correctAnswer).length > 1) {
    return { problem: `has the correct option "${correctAnswer}" twice, so the right choice could not be told apart` };
  }

  return { options, correctAnswer };
}

export interface TranslationProblem {
  path: Array<string | number>;
  message: string;
}

/**
 * Everything wrong with a question's translations, for the admin form to
 * report. Empty means they can be saved.
 *
 * This is stricter than serving is: a translation with a stray field is refused
 * here so it gets fixed, but never takes a question down when it is read.
 */
export function translationProblems(
  question: Pick<BankQuestion, "subjectId" | "type" | "options" | "correctAnswer" | "translations">
): TranslationProblem[] {
  const entries = siteLanguages.flatMap((language) => {
    const translation = question.translations[language];
    return translation ? [{ language, translation }] : [];
  });

  if (entries.length === 0) return [];

  if (!followsSiteLanguage(question.subjectId)) {
    return [
      {
        path: ["translations"],
        message: `${subjectName(question.subjectId)} questions are always shown in one language, so translations on one would never be used.`
      }
    ];
  }

  const problems: TranslationProblem[] = [];

  for (const { language, translation } of entries) {
    const name = languageNames[language];
    // An empty list is the same as no list, the way it is when serving.
    const hasOptions = (translation.options?.length ?? 0) > 0;
    const hasAnswer = translation.correctAnswer !== undefined;

    if (question.type === "multiple-choice") {
      if (hasAnswer) {
        problems.push({
          path: ["translations", language, "correctAnswer"],
          message: `${name} translation: a multiple choice answer is the option in the same position, so leave the answer out.`
        });
      }

      const choices = translatedChoices(question, translation);
      if (choices && "problem" in choices) {
        problems.push({ path: ["translations", language, "options"], message: `${name} translation ${choices.problem}.` });
      }
    } else {
      if (hasOptions) {
        problems.push({
          path: ["translations", language, "options"],
          message: `${name} translation: only multiple choice questions have options.`
        });
      }
      if (question.type === "open-ended" && hasAnswer) {
        problems.push({
          path: ["translations", language, "correctAnswer"],
          message: `${name} translation: the marker reads the marking guide as written, so it is not translated.`
        });
      }
    }
  }

  return problems;
}

/**
 * The question as the student should be given it.
 *
 * Returns the question untouched unless its subject follows the site language
 * and there is a translation in this language that fits it. Anything that does
 * not fit falls back to the question's own text, because a test that cannot be
 * built is worse than one in the wrong language.
 */
export function localizeQuestion(question: BankQuestion, language: SiteLanguage | undefined): BankQuestion {
  if (!language || !followsSiteLanguage(question.subjectId)) return question;

  const translation = question.translations[language];
  if (!translation || translation.prompt.trim().length === 0) return question;

  const choices = question.type === "multiple-choice" ? translatedChoices(question, translation) : null;
  if (choices && "problem" in choices) return question;

  // A short answer can read differently by language ("26 cm", "26 см"). It is
  // the only type whose answer is taken from the translation as written.
  const shortAnswer =
    question.type === "short-answer" && translation.correctAnswer && translation.correctAnswer.trim().length > 0
      ? translation.correctAnswer
      : null;

  return {
    ...question,
    prompt: translation.prompt,
    options: choices?.options ?? question.options,
    correctAnswer: choices?.correctAnswer ?? shortAnswer ?? question.correctAnswer,
    explanation:
      translation.explanation && translation.explanation.trim().length > 0
        ? translation.explanation
        : question.explanation
  };
}
