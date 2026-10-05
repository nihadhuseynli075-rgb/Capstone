import type { Difficulty, QuestionDraft, QuestionTranslation, QuestionTranslations, QuestionType } from "@grade9/shared";
import { markLimits, paperYearLimits, repeatedOption, subjects, topicIdFor } from "@grade9/shared";
import { languageNames, translationProblems } from "./questionTranslations";

/**
 * Imports questions pasted straight out of a spreadsheet.
 *
 * Nihad is compiling past-paper questions in Google Sheets, so the fastest path
 * into the bank is File -> Download -> CSV, then paste. Retyping fifty questions
 * into a form by hand is the thing this avoids.
 */

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportResult {
  drafts: QuestionDraft[];
  errors: ImportRowError[];
}

/**
 * Which character separates the columns, read from the header row.
 *
 * Google Sheets offers a tab-separated download next to the CSV one, and copying
 * cells out of a sheet gives tabs too. The header row never contains a comma of
 * its own, so more tabs than commas in it means a tab-separated sheet. Anything
 * else is the comma-separated format this has always read.
 */
function detectDelimiter(text: string): "," | "\t" {
  const headerLine = text.split("\n", 1)[0];
  const tabs = headerLine.split("\t").length - 1;
  const commas = headerLine.split(",").length - 1;
  return tabs > 0 && tabs >= commas ? "\t" : ",";
}

/**
 * Minimal RFC 4180 CSV reader.
 *
 * Handles quoted fields, escaped quotes, commas and newlines inside quotes, and
 * both LF and CRLF line endings. Written out rather than pulled from a package
 * so the whole import path stays readable in one file. A tab-separated sheet is
 * read the same way, with tabs where the commas would be.
 */
export function parseCsv(input: string): string[][] {
  return parseCsvChecked(input).rows;
}

/**
 * The same reader, but it also says where a quote was opened and never closed.
 *
 * A quote only opens a quoted field when it is the first character of the
 * field. That is what both formats mean by it: a CSV writer quotes the whole
 * cell, and Google Sheets does the same in a tab-separated download, where it
 * quotes only the cells that hold a newline, a tab or a quote and leaves every
 * other cell bare. A quote in the middle of a bare cell (`Choose the "right"
 * word`, `He is 6' 2" tall`) is just text. If the text ends inside a quote, the
 * rows from the one where that quote opened are left out and its number is
 * returned, instead of the quote swallowing every row after it.
 */
export function parseCsvChecked(input: string): { rows: string[][]; unterminatedRow?: number } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let atFieldStart = true;
  let openedAtRow = 0;
  let index = 0;

  // A leading byte order mark survives most spreadsheet exports.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
      openedAtRow = rows.filter(hasContent).length + 1;
      index += 1;
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = "";
      atFieldStart = true;
      index += 1;
      continue;
    }

    if (char === "\r") {
      index += 1;
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      atFieldStart = true;
      index += 1;
      continue;
    }

    field += char;
    atFieldStart = false;
    index += 1;
  }

  if (inQuotes) {
    return { rows: rows.filter(hasContent), unterminatedRow: openedAtRow };
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return { rows: rows.filter(hasContent) };
}

const hasContent = (entry: string[]) => entry.some((value) => value.trim().length > 0);

/** Header names we accept for each field, so the sheet does not have to be exact. */
const headerAliases: Record<string, string[]> = {
  subjectId: ["subject", "subject_id", "subjectid"],
  topicId: ["topic", "topic_id", "topicid"],
  difficulty: ["difficulty", "level"],
  type: ["type", "question_type", "questiontype"],
  prompt: ["question", "prompt", "question_text", "text"],
  optionA: ["option_a", "a", "optiona", "answer_a"],
  optionB: ["option_b", "b", "optionb", "answer_b"],
  optionC: ["option_c", "c", "optionc", "answer_c"],
  optionD: ["option_d", "d", "optiond", "answer_d"],
  optionE: ["option_e", "e", "optione", "answer_e"],
  correctAnswer: ["correct_answer", "answer", "correct", "correctanswer"],
  marks: ["marks", "mark", "points", "point", "weight"],
  explanation: ["explanation", "reason", "why"],
  imageUrl: ["image_url", "image", "picture", "imageurl"],
  paperYear: ["paper_year", "year", "paperyear"],
  source: ["source", "paper", "origin", "school"]
};

/**
 * The columns that can be given again in another language, and the languages a
 * sheet can give them in. Each is the column's usual name with the language on
 * the end: `question_ru`, `option_a_en`, `explanation_ru`.
 */
const translatedFields = [
  "prompt",
  "optionA",
  "optionB",
  "optionC",
  "optionD",
  "optionE",
  "correctAnswer",
  "explanation"
] as const;

const importLanguages = [
  { id: "en", name: "english" },
  { id: "ru", name: "russian" }
] as const;

/** The key a translated column is kept under: "prompt:ru". */
const translatedField = (field: string, language: string) => `${field}:${language}`;

// A translated column answers to each of the column's names with the language
// added, in the three ways a sheet is likely to write it: `question_ru`,
// `question_russian` and `Question (Russian)`.
for (const field of translatedFields) {
  for (const language of importLanguages) {
    headerAliases[translatedField(field, language.id)] = headerAliases[field].flatMap((alias) => [
      `${alias}_${language.id}`,
      `${alias}_${language.name}`,
      `${alias}_(${language.name})`,
      `${alias}_(${language.id})`
    ]);
  }
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function mapHeaders(headerRow: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};

  headerRow.forEach((raw, columnIndex) => {
    const header = normalizeHeader(raw);
    for (const [field, aliases] of Object.entries(headerAliases)) {
      if (aliases.includes(header)) {
        // First matching column wins, so a duplicate header cannot clobber it.
        if (mapping[field] === undefined) mapping[field] = columnIndex;
      }
    }
  });

  // A sheet that only has "Question (English)" and "Question (Russian)" has no
  // plain question column. The bank's own text is English, so the English
  // columns are the question and the Russian ones its translation. Without this
  // the whole sheet would be refused for a column it has under another name.
  //
  // Decided by the question column alone, so a sheet that does have a plain one
  // is never half English-based because it also has an `explanation_en`.
  if (mapping.prompt === undefined && mapping[translatedField("prompt", "en")] !== undefined) {
    for (const field of translatedFields) {
      const english = mapping[translatedField(field, "en")];
      if (mapping[field] === undefined && english !== undefined) {
        mapping[field] = english;
        delete mapping[translatedField(field, "en")];
      }
    }
  }

  return mapping;
}

/** Other ways a sheet writes each subject, besides its id and display name. */
const subjectAliases: Record<string, string[]> = {
  math: ["maths", "mathematics", "математика", "riyaziyyat"],
  english: ["english language", "английский язык", "ingilis dili", "\u0130ngilis dili".toLowerCase()],
  russian: ["russian language", "русский язык", "rus dili"]
};

/** The known subject id a cell means, matched without regard to case, or null. */
function resolveSubject(value: string): string | null {
  const typed = value.trim().toLowerCase().replace(/\s+/g, " ");
  const match = subjects.find(
    (subject) =>
      subject.id === typed ||
      subject.name.toLowerCase() === typed ||
      subjectAliases[subject.id]?.includes(typed)
  );
  return match?.id ?? null;
}

const difficulties: Difficulty[] = ["easy", "medium", "hard"];

function parseDifficulty(value: string): Difficulty | null {
  const normalized = value.trim().toLowerCase();
  return difficulties.includes(normalized as Difficulty) ? (normalized as Difficulty) : null;
}

/** A whole number within a column's limits, the rule the API applies too. */
function isWholeNumberWithin(value: number, limits: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= limits.min && value <= limits.max;
}

function parseType(value: string, optionCount: number): QuestionType {
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (normalized === "short-answer" || normalized === "short" || normalized === "text") {
    return "short-answer";
  }
  if (normalized === "multiple-choice" || normalized === "mcq" || normalized === "multiple") {
    return "multiple-choice";
  }
  // Written answers marked by the AI marker; the answer column holds the
  // marking guide.
  if (normalized === "open-ended" || normalized === "open" || normalized === "written" || normalized === "essay") {
    return "open-ended";
  }
  // Blank type column: infer from whether options were supplied.
  return optionCount >= 2 ? "multiple-choice" : "short-answer";
}

/**
 * Resolves the correct answer to option text.
 *
 * Spreadsheets normally record the letter, but the bank stores the answer text
 * so that marking never has to care about option ordering.
 *
 * `options` is the option columns as they are in the sheet, blanks included. A
 * letter names a column, so with option_b left empty "C" is still whatever is
 * under option_c; counting only the filled-in options would quietly make it
 * option_d, and the question would mark the wrong answer as right.
 */
export function resolveCorrectAnswer(raw: string, options: string[]): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;

  const filled = options.filter((option) => option.length > 0);
  if (filled.length === 0) return value;

  const exact = filled.find((option) => option === value);
  if (exact) return exact;

  const letterMatch = /^\(?([a-eA-E])\)?[.)]?$/.exec(value);
  if (letterMatch) {
    const chosen = options[letterMatch[1].toUpperCase().charCodeAt(0) - 65] ?? "";
    return chosen.length > 0 ? chosen : null;
  }

  const caseInsensitive = filled.find(
    (option) => option.trim().toLowerCase() === value.toLowerCase()
  );
  return caseInsensitive ?? null;
}

export function importQuestionsFromCsv(csv: string): ImportResult {
  const { rows, unterminatedRow } = parseCsvChecked(csv);
  const drafts: QuestionDraft[] = [];
  const errors: ImportRowError[] = [];

  if (unterminatedRow !== undefined) {
    errors.push({
      row: unterminatedRow,
      message: `A quote opened in this row is never closed, so this row and the ones after it were not read. Close the quote, or remove it if it is part of the text.`
    });
  }

  if (rows.length === 0) {
    if (errors.length > 0) return { drafts, errors };
    return { drafts, errors: [{ row: 0, message: "The pasted text was empty." }] };
  }

  const mapping = mapHeaders(rows[0]);

  const missing = ["subjectId", "topicId", "prompt", "correctAnswer"].filter(
    (field) => mapping[field] === undefined
  );

  if (missing.length > 0) {
    // Named as the sheet names them (the first of each field's aliases), not
    // by the field names inside this file: "subjectId, topicId" meant nothing
    // to someone looking at a spreadsheet.
    const columns = missing.map((field) => headerAliases[field][0]);

    return {
      drafts,
      errors: [
        {
          row: 1,
          message: `Missing column(s): ${columns.join(", ")}. The header row needs at least subject, topic, question and correct_answer.`
        }
      ]
    };
  }

  const cell = (row: string[], field: string): string => {
    const columnIndex = mapping[field];
    if (columnIndex === undefined) return "";
    return (row[columnIndex] ?? "").trim();
  };

  rows.slice(1).forEach((row, offset) => {
    // Row number as the person sees it in the spreadsheet: header is row 1.
    const rowNumber = offset + 2;

    const prompt = cell(row, "prompt");
    if (prompt.length === 0) {
      errors.push({ row: rowNumber, message: "Question text is empty." });
      return;
    }

    // Having the column is not the same as having the value. A question with no
    // subject or no topic is not a question anyone can ever be asked: the
    // builder filters on both, so it sits in the bank unreachable and uncounted.
    // Saying so is the difference between a row that failed and a row that
    // vanished.
    const rawSubject = cell(row, "subjectId");
    if (rawSubject.length === 0) {
      errors.push({ row: rowNumber, message: "Subject is empty." });
      return;
    }

    // Only the subjects the site has. Any other text used to be stored as a
    // subject of its own, which put "Maths 1" and "Physics 1" chips beside the
    // real ones in the test builder with no admin filter that could reach them.
    const subjectId = resolveSubject(rawSubject);
    if (subjectId === null) {
      errors.push({
        row: rowNumber,
        message: `Subject "${rawSubject}" is not one of ${subjects.map((subject) => subject.id).join(", ")}.`
      });
      return;
    }

    const rawTopic = cell(row, "topicId");
    if (rawTopic.length === 0) {
      errors.push({ row: rowNumber, message: "Topic is empty." });
      return;
    }
    // A topic's name means the topic: "Functions and Graphs" is `functions`.
    // Only a topic the subject does not have becomes a new id.
    const topicId = topicIdFor(rawTopic, subjects.find((subject) => subject.id === subjectId)?.topics ?? []);

    const optionCells = [
      cell(row, "optionA"),
      cell(row, "optionB"),
      cell(row, "optionC"),
      cell(row, "optionD"),
      cell(row, "optionE")
    ];
    const options = optionCells.filter((option) => option.length > 0);

    const type = parseType(cell(row, "type"), options.length);

    if (type === "multiple-choice" && options.length < 2) {
      errors.push({
        row: rowNumber,
        message: "Multiple choice needs at least two options in option_a / option_b."
      });
      return;
    }

    // Held to the same rule as the admin form: two options reading the same
    // would both be marked right, or both wrong.
    const repeated = type === "multiple-choice" ? repeatedOption(options) : null;
    if (repeated !== null) {
      errors.push({ row: rowNumber, message: `Two options are the same ("${repeated}"). Each option has to be different.` });
      return;
    }

    const correctAnswer = resolveCorrectAnswer(
      cell(row, "correctAnswer"),
      type === "multiple-choice" ? optionCells : []
    );

    if (!correctAnswer) {
      errors.push({
        row: rowNumber,
        message: `Correct answer "${cell(row, "correctAnswer")}" does not match any of the options.`
      });
      return;
    }

    const rawDifficulty = cell(row, "difficulty");
    const difficulty = parseDifficulty(rawDifficulty);
    if (rawDifficulty.length > 0 && !difficulty) {
      errors.push({
        row: rowNumber,
        message: `Difficulty "${rawDifficulty}" is not easy, medium or hard.`
      });
      return;
    }

    // Blank means one mark, which is what the paper means by saying nothing.
    // A value that is there but nonsense is a mistake worth reporting rather
    // than quietly rounding to one.
    const rawMarks = cell(row, "marks");
    const marks = rawMarks.length === 0 ? markLimits.min : Number(rawMarks);

    // Number rather than parseInt: "2.5" and "3 marks" are mistakes worth
    // reporting, not values to round down to something plausible. The ceiling is
    // the one the admin form and the API already enforce, so a cell typed into
    // the wrong column cannot quietly weight one question above the whole paper.
    if (!isWholeNumberWithin(marks, markLimits)) {
      errors.push({
        row: rowNumber,
        message: `Marks "${rawMarks}" is not a whole number between ${markLimits.min} and ${markLimits.max}.`
      });
      return;
    }

    // Blank means the year is not known. Anything else is held to the rule the
    // admin form and the API apply, like marks above: parseInt read "2024.5" as
    // 2024 and "20 24" as 20, and a number too big for the column failed the
    // whole import instead of this one row.
    const rawYear = cell(row, "paperYear");
    const paperYear = rawYear.length === 0 ? null : Number(rawYear);

    if (paperYear !== null && !isWholeNumberWithin(paperYear, paperYearLimits)) {
      errors.push({
        row: rowNumber,
        message: `Paper year "${rawYear}" is not a year between ${paperYearLimits.min} and ${paperYearLimits.max}.`
      });
      return;
    }

    const draftOptions = type === "multiple-choice" ? options : [];

    // The other languages, each only if the sheet gave it something. A language
    // with the question text left blank but options or an explanation filled in
    // is a mistake worth naming, not a translation to guess the text of.
    const translations: QuestionTranslations = {};
    let translationError: string | null = null;

    for (const language of importLanguages) {
      const translatedPrompt = cell(row, translatedField("prompt", language.id));
      const translatedOptions = (["optionA", "optionB", "optionC", "optionD", "optionE"] as const)
        .map((field) => cell(row, translatedField(field, language.id)))
        .filter((option) => option.length > 0);
      const translatedExplanation = cell(row, translatedField("explanation", language.id));
      // Only a short answer has an answer that reads differently by language.
      // For multiple choice the column usually repeats the letter, which the
      // position of the options already says.
      const translatedAnswer =
        type === "short-answer" ? cell(row, translatedField("correctAnswer", language.id)) : "";

      if (
        translatedPrompt.length === 0 &&
        translatedOptions.length === 0 &&
        translatedExplanation.length === 0 &&
        translatedAnswer.length === 0
      ) {
        continue;
      }

      if (translatedPrompt.length === 0) {
        translationError = `The ${languageNames[language.id]} translation has no question text.`;
        break;
      }

      const translation: QuestionTranslation = { prompt: translatedPrompt };
      if (translatedOptions.length > 0) translation.options = translatedOptions;
      if (translatedExplanation.length > 0) translation.explanation = translatedExplanation;
      if (translatedAnswer.length > 0) translation.correctAnswer = translatedAnswer;
      translations[language.id] = translation;
    }

    // The same rules the admin form is held to: options in step with the
    // question's own, and only for a subject that follows the site language.
    translationError ??=
      translationProblems({ subjectId, type, options: draftOptions, correctAnswer, translations })[0]?.message ?? null;

    if (translationError) {
      errors.push({ row: rowNumber, message: translationError });
      return;
    }

    drafts.push({
      subjectId,
      topicId,
      difficulty: difficulty ?? "medium",
      type,
      prompt,
      options: draftOptions,
      correctAnswer,
      marks,
      explanation: cell(row, "explanation"),
      imageUrl: cell(row, "imageUrl") || null,
      paperYear,
      source: cell(row, "source") || null,
      translations
    });
  });

  return { drafts, errors };
}
