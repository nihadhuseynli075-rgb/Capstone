/**
 * The admin dashboard's words, in English only.
 *
 * The dashboard is an internal tool and every heading, tab, label and button
 * on it is English. A few of its strings (the drop zone, the import hints and
 * the translations section) went through the site's dictionaries, so with the
 * site set to Russian or Azerbaijani one screen mixed two languages: "Переводы"
 * and "Проверьте текст ниже и нажмите Import questions." beside English
 * headings. They live here instead, so the page reads in one language
 * whatever the site language is.
 */
export const adminText = {
  translationsTitle: "Translations",
  translationsOptional: "optional",
  translationsIntro:
    "Maths questions are shown in the language a student has chosen for the site. Above is the question as first written. Add other languages here; where there is no translation, students see the text above.",
  translationPrompt: "Question text",
  translationOptions: "Options, in the same order as above",
  translationOptionFor: "translation of",
  translationCorrectOption: "Correct answer",
  translationExplanation: "Explanation",
  translationAnswer: "Correct answer in this language",
  translationAnswerHint:
    "Only for short answers that read differently, like 26 cm and 26 см. Leave empty to use the answer above.",
  translationAddOptionsFirst:
    "Fill in the options above first: each translated option is matched to one of them by its position.",
  translationErrorNoPrompt: "add the question text, or clear everything for this language.",
  translationErrorOptions: "translate every option shown, or none of them.",
  translationsListLabel: "Translations",
  translationsListNone: "none yet",

  importDropTitle: "Drop a CSV or TSV file here",
  importDropOr: "or",
  importChoose: "choose a file",
  importDropActive: "Drop to load this file",
  importLoaded: "Loaded",
  importLoadedHint: "Check it below, then press Import questions.",
  importNotSheet: "That is not a .csv or .tsv file. In Google Sheets choose File, Download, Comma-separated values.",
  importEmpty: "That file is empty.",
  importDuplicatesOne: "Row {rows} is already in the bank, so it was left out.",
  importDuplicatesMany: "Rows {rows} are already in the bank, so they were left out.",
  importFixAndRetry:
    "Your paste is still in the box. Fix the rows below and press Import questions again: rows already in the bank are left out, so nothing goes in twice.",
  importTooBig: "That file is over 2 MB, which is far more than a question sheet. Check it is the right one.",
  importUnreadable: "That file could not be read.",
  importFirstOnly: "Only one file is loaded at a time, so only the first was used.",
  importTranslationHint:
    "A translation goes in a column with the same name ending in _ru or _en: question_ru, option_a_ru, explanation_ru. See docs/question-format.md.",

  sessionEnded: "Your admin session has ended, so you need to sign in again.",
  sessionEndedDraft:
    "Your admin session ended before the question was saved. It has been kept: sign in again and it is saved straight away.",
  // The whole bank, whatever the list is filtered to, in a form that needs no plural.
  bankCount: "Questions in the bank: {total}.",
  bankMatching: "Questions in the bank: {total}. Matching this filter: {count}.",
  noMatch: "No question matches this filter. Clear the search or choose all subjects to see the whole bank."
} as const;

/** A translation language's name, in English like the rest of the dashboard. */
export const adminLanguageNames: Record<"en" | "ru", string> = {
  en: "English",
  ru: "Russian"
};
