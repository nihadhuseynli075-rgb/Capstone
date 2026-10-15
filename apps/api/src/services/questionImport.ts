import type { Difficulty, QuestionDraft, QuestionTranslation, QuestionTranslations, QuestionType } from "@grade9/shared";
import { markLimits, paperYearLimits, repeatedOption, subjects, testScopeLimits, topicIdFor } from "@grade9/shared";
import { checkPictureLink, httpsPicturesOnly, quotedLink, type PictureLinkRules } from "./pictureLinks";
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
  /** The spreadsheet row each draft came from, in the same order as `drafts`. */
  draftRows: number[];
  errors: ImportRowError[];
}

/** The characters a sheet's columns can be separated by. Comma is first, so it wins a tie. */
const delimiters = [",", "\t", ";"] as const;
type Delimiter = (typeof delimiters)[number];

/**
 * Which character separates the columns, read from the header row.
 *
 * Google Sheets offers a tab-separated download next to the CSV one, and copying
 * cells out of a sheet gives tabs too. Excel saves its CSV with semicolons
 * wherever the comma is the decimal mark, Azerbaijani and Russian Windows among
 * them, and a sheet saved there was read as one long column and refused for
 * missing every column it has.
 *
 * The header is split by each separator in turn, and the one that turns the
 * most of its cells into column names this import knows wins: a wrong one
 * leaves the names run together in cells that match nothing. A header with no
 * name it knows is split by the separator it holds most of, comma on a tie. A
 * header with no tab or semicolon is one cell either of those ways, so it stays
 * comma-separated, as it always was. Only the header decides, because the
 * question text below it is full of commas and semicolons of its own.
 */
function detectDelimiter(text: string): Delimiter {
  // The first line with anything on it: blank rows above the header are
  // skipped when the rows are read, so they must not decide this either. Only
  // its start is weighed. A header is a few hundred characters, and a paste
  // that is one enormous line was otherwise read three times over here, which
  // held up the API for seconds before the import had even begun.
  const headerLine = (text.split("\n").find((line) => line.trim().length > 0) ?? "").slice(0, 10_000);

  let best = { delimiter: "," as Delimiter, known: -1, separators: -1 };
  for (const delimiter of delimiters) {
    const cells = headerCells(headerLine, delimiter);
    const known = Object.keys(mapHeaders(cells)).length;
    const separators = cells.length - 1;
    if (known > best.known || (known === best.known && separators > best.separators)) {
      best = { delimiter, known, separators };
    }
  }
  return best.delimiter;
}

/**
 * The header line's cells, split by one separator and read the way
 * readSheetRows reads a row: a quote opens a quoted cell only at the start of
 * one, and a separator inside a quoted cell is part of its text, not a column.
 */
function headerCells(line: string, delimiter: Delimiter): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let atCellStart = true;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (inQuotes) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && atCellStart) {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
      atCellStart = true;
      continue;
    } else if (char !== "\r") {
      cell += char;
    }
    atCellStart = false;
  }

  cells.push(cell);
  return cells;
}

/**
 * Minimal RFC 4180 CSV reader.
 *
 * Handles quoted fields, escaped quotes, commas and newlines inside quotes, and
 * both LF and CRLF line endings. Written out rather than pulled from a package
 * so the whole import path stays readable in one file. A sheet separated by
 * tabs or semicolons is read the same way, with those where the commas would be.
 */
export function parseCsv(input: string): string[][] {
  return parseCsvChecked(input).rows;
}

/** One row of the sheet, with the number the spreadsheet shows beside it. */
export interface SheetRow {
  row: number;
  cells: string[];
}

/** The rows readSheetRows finds, without their spreadsheet numbers. */
export function parseCsvChecked(input: string): { rows: string[][]; unterminatedRow?: number } {
  const { rows, unterminatedRow } = readSheetRows(input);
  return { rows: rows.map((entry) => entry.cells), unterminatedRow };
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
 *
 * Each record is one spreadsheet row, however many lines a quoted cell spans,
 * so a row's number is its record's position. It is taken before blank rows
 * are left out: numbering what was left once they had gone reported every row
 * below a gap in the sheet one row too early, pointing at the wrong question.
 */
export function readSheetRows(input: string): { rows: SheetRow[]; unterminatedRow?: number } {
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
      openedAtRow = rows.length + 1;
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

  const numbered = (records: string[][]): SheetRow[] =>
    records
      .map((cells, position) => ({ row: position + 1, cells }))
      .filter((entry) => hasContent(entry.cells));

  if (inQuotes) {
    return { rows: numbered(rows), unterminatedRow: openedAtRow };
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return { rows: numbered(rows) };
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

/**
 * Whether a bare letter answer could mean two different options.
 *
 * Grammar questions about articles have options such as "the", "an" and "a".
 * An answer of "a" there could be the letter naming the first column or the
 * text of the third, and whichever reading won, half the time students would
 * be marked against the wrong key. A letter in brackets or with a stop, "(A)"
 * or "A.", is only ever a letter, so that is the way out offered.
 */
export function isAmbiguousLetterAnswer(raw: string, options: string[]): boolean {
  const value = raw.trim();
  if (!/^[a-eA-E]$/.test(value)) return false;

  const letterIndex = value.toUpperCase().charCodeAt(0) - 65;
  if ((options[letterIndex] ?? "").length === 0) return false;

  return options.some(
    (option, index) => index !== letterIndex && option.trim().toLowerCase() === value.toLowerCase()
  );
}

/**
 * A cell holding a whole number written plainly, digits only.
 *
 * Number() alone also reads "0x10" as 16, "1e1" as 10 and "2.024e3" as 2024,
 * none of which anyone typing a mark or a year meant, so those are reported
 * like any other value that is not a number.
 */
function parseWholeNumber(raw: string): number {
  return /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
}

/**
 * `pictureLinks` says which image_url values are links to a picture, as the
 * admin form's own save does (see pictureLinks.ts). Without it only https://
 * links are taken.
 */
export function importQuestionsFromCsv(csv: string, options: { pictureLinks?: PictureLinkRules } = {}): ImportResult {
  const pictureLinks = options.pictureLinks ?? httpsPicturesOnly;
  const { rows, unterminatedRow } = readSheetRows(csv);
  const drafts: QuestionDraft[] = [];
  const draftRows: number[] = [];
  const errors: ImportRowError[] = [];

  if (unterminatedRow !== undefined) {
    errors.push({
      row: unterminatedRow,
      message: `A quote opened in this row is never closed, so this row and the ones after it were not read. Close the quote, or remove it if it is part of the text.`
    });
  }

  if (rows.length === 0) {
    if (errors.length > 0) return { drafts, draftRows, errors };
    return { drafts, draftRows, errors: [{ row: 0, message: "The pasted text was empty." }] };
  }

  const [headerRow, ...dataRows] = rows;
  const mapping = mapHeaders(headerRow.cells);

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
      draftRows,
      errors: [
        {
          row: headerRow.row,
          message: `Missing column(s): ${columns.join(", ")}. The header row needs at least subject, topic, question and correct_answer.`
        }
      ]
    };
  }

  // A header with nothing under it imported nothing and said only "Imported 0
  // questions.", with no reason. Blank rows are gone by now, so a header with
  // only those below it is the same. A quote left open below the header has
  // already said why its rows were not read.
  if (dataRows.length === 0 && errors.length === 0) {
    return { drafts, draftRows, errors: [{ row: headerRow.row, message: "There are no question rows under the header row." }] };
  }

  const cell = (row: string[], field: string): string => {
    const columnIndex = mapping[field];
    if (columnIndex === undefined) return "";
    return (row[columnIndex] ?? "").trim();
  };

  // Each row carries the number the spreadsheet shows beside it (see readSheetRows).
  dataRows.forEach(({ row: rowNumber, cells: row }) => {
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
    // Held to the length a test can ask for, as the admin form is: a longer
    // topic would import but never be drawn into a paper.
    if (topicId.length > testScopeLimits.maxIdLength) {
      errors.push({ row: rowNumber, message: `Topic is longer than ${testScopeLimits.maxIdLength} characters.` });
      return;
    }

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

    const answerOptions = type === "multiple-choice" ? optionCells : [];

    if (isAmbiguousLetterAnswer(cell(row, "correctAnswer"), answerOptions)) {
      const letter = cell(row, "correctAnswer").toUpperCase();
      errors.push({
        row: rowNumber,
        message: `Correct answer "${cell(row, "correctAnswer")}" could be option ${letter} or the option that reads "${cell(row, "correctAnswer")}". Write the right option's letter in brackets instead, such as "(${letter})".`
      });
      return;
    }

    const correctAnswer = resolveCorrectAnswer(cell(row, "correctAnswer"), answerOptions);

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
    const marks = rawMarks.length === 0 ? markLimits.min : parseWholeNumber(rawMarks);

    // Digits only rather than parseInt: "2.5" and "3 marks" are mistakes worth
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
    const paperYear = rawYear.length === 0 ? null : parseWholeNumber(rawYear);

    if (paperYear !== null && !isWholeNumberWithin(paperYear, paperYearLimits)) {
      errors.push({
        row: rowNumber,
        message: `Paper year "${rawYear}" is not a year between ${paperYearLimits.min} and ${paperYearLimits.max}.`
      });
      return;
    }

    // A link to the picture, never the picture's file name. "diagram1.png"
    // imported as ready showed students a broken picture, and a written
    // answer on it could never be marked. Kept written out in full, as the
    // admin form's save keeps it.
    const rawImageUrl = cell(row, "imageUrl");
    const picture = rawImageUrl.length > 0 ? checkPictureLink(rawImageUrl, pictureLinks) : null;
    if (picture !== null && "problem" in picture) {
      errors.push({
        row: rowNumber,
        message:
          picture.problem === "inline-with-storage"
            ? "image_url holds a picture itself (a data: link), which only works while no Supabase storage is connected. Leave image_url empty and add the picture in the admin form."
            : `image_url "${quotedLink(rawImageUrl)}" is not a full link starting with https://. Put the picture's full link there, or leave image_url empty and add the picture in the admin form.`
      });
      return;
    }
    const imageUrl = picture === null ? null : picture.link;

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

    draftRows.push(rowNumber);
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
      imageUrl,
      paperYear,
      source: cell(row, "source") || null,
      translations
    });
  });

  return { drafts, draftRows, errors };
}

/**
 * What makes two questions the same question: subject, topic, type, the text
 * and the options, ignoring capitals and runs of spaces.
 *
 * Pasting a sheet a second time, after fixing the rows that failed the first
 * time, used to import every good row again. Difficulty, marks and the answer
 * are left out on purpose: a row that differs only there is the same question
 * typed twice, and the copy in the bank is the one to edit.
 */
export function questionKey(question: Pick<QuestionDraft, "subjectId" | "topicId" | "type" | "prompt" | "options">): string {
  const tidy = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
  return JSON.stringify([question.subjectId, question.topicId, question.type, tidy(question.prompt), question.options.map(tidy)]);
}

/**
 * The drafts that are not already in the bank, and the rows of the ones that
 * were left out because they are (or repeat an earlier row of the same paste).
 */
export function withoutDuplicates(
  result: Pick<ImportResult, "drafts" | "draftRows">,
  bank: Array<Parameters<typeof questionKey>[0]>
): { drafts: QuestionDraft[]; duplicateRows: number[] } {
  const seen = new Set(bank.map(questionKey));
  const drafts: QuestionDraft[] = [];
  const duplicateRows: number[] = [];

  result.drafts.forEach((draft, index) => {
    const key = questionKey(draft);
    if (seen.has(key)) {
      duplicateRows.push(result.draftRows[index]);
      return;
    }
    seen.add(key);
    drafts.push(draft);
  });

  return { drafts, duplicateRows };
}
