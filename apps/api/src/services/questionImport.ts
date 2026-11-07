import type {
  Difficulty,
  Passage,
  PassageDraft,
  QuestionDraft,
  QuestionTranslation,
  QuestionTranslations,
  QuestionType
} from "@grade9/shared";
import {
  encodeAnswerSet,
  markLimits,
  paperYearLimits,
  passageLimits,
  repeatedOption,
  subjects,
  testScopeLimits,
  topicIdFor
} from "@grade9/shared";
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
  /**
   * What each draft needs besides the draft itself, in the same order: whether
   * it is ready or still a draft and why, its subtopic, its sheet key, and the
   * passage it belongs to.
   */
  rows: ImportedRow[];
  /** The passages the question rows carry the text of, to save before the questions that point at them. */
  passages: ImportedPassage[];
  /**
   * Set when the one problem is the header row itself: a column missing, or
   * no question rows under it. No row of questions was left out then, so the
   * dashboard does not count one as skipped.
   */
  headerProblem?: true;
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
  prompt: ["question", "prompt", "question_text", "text", "question_(original_az)", "question_(original)"],
  optionA: ["option_a", "a", "optiona", "answer_a"],
  optionB: ["option_b", "b", "optionb", "answer_b"],
  optionC: ["option_c", "c", "optionc", "answer_c"],
  optionD: ["option_d", "d", "optiond", "answer_d"],
  optionE: ["option_e", "e", "optione", "answer_e"],
  correctAnswer: ["correct_answer", "answer", "correct", "correctanswer", "correct_answer_(dim)", "correct_answer_(official)"],
  marks: ["marks", "mark", "points", "point", "weight"],
  explanation: ["explanation", "reason", "why"],
  imageUrl: ["image_url", "image", "picture", "imageurl"],
  paperYear: ["paper_year", "year", "paperyear"],
  source: ["source", "paper", "origin", "school"],
  // The columns of Nihad's own workbook (see docs/question-format.md). Each is
  // optional: a sheet without them imports exactly as it always did.
  number: ["q#", "q_#", "q_no", "q_number", "question_number", "question_no", "no", "number"],
  subtopic: ["subtopic", "sub_topic", "sub-topic"],
  optionsFull: ["answer_options_(full)", "answer_options", "options_full", "options"],
  date: ["date", "paper_date", "exam_date"],
  sector: ["sector", "sector_(az)", "sector_(ru)"],
  variant: ["variant", "paper_variant"],
  passageRef: ["passage_id", "passage_ref", "passageid", "passage"],
  passageTitle: ["passage_title", "passagetitle"],
  passageBody: ["passage_(separate_column)", "passage_text", "passage_body"]
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
  { id: "ru", name: "russian" },
  { id: "az", name: "azerbaijani" }
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
  // Lowercasing the Turkic capital "İ" (as in "DİM") leaves a loose combining
  // dot behind. It is dropped, so a header typed with the capital still matches.
  return value.trim().toLowerCase().replace(/̇/g, "").replace(/\s+/g, "_");
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
  russian: ["russian language", "русский язык", "rus dili"],
  azerbaijani: ["azerbaijani", "azerbaijani language", "азербайджанский язык", "azərbaycan dili"]
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

/**
 * easy, medium or hard by name, or 1, 2 or 3. Excel turns a typed 1 into "1.0"
 * when a sheet is exported, so that is read as 1 too.
 */
function parseDifficulty(value: string): Difficulty | null {
  const normalized = value.trim().toLowerCase();
  if (difficulties.includes(normalized as Difficulty)) return normalized as Difficulty;
  const level = /^([123])(?:[.,]0+)?$/.exec(normalized);
  return level ? difficulties[Number(level[1]) - 1] : null;
}

/** A whole number within a column's limits, the rule the API applies too. */
function isWholeNumberWithin(value: number, limits: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= limits.min && value <= limits.max;
}

/**
 * What the "Answer Options (full)" column says about a question that has no
 * lettered options: that it is a written answer, a short answer, or that it
 * lists choices in some way the options columns cannot take ("1) as 2) if").
 */
type OptionsHint = "open-ended" | "short-answer" | "choices" | null;

function parseType(value: string, optionCount: number, hint: OptionsHint = null): QuestionType {
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  // Tick every right option. Written several ways in a sheet.
  if (
    normalized === "multiple-select" ||
    normalized === "multi-select" ||
    normalized === "multi" ||
    normalized === "select-all" ||
    normalized === "select-all-that-apply" ||
    normalized === "multiple-answers" ||
    normalized === "multiple-answer" ||
    normalized === "checkbox"
  ) {
    return "multiple-select";
  }
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
  if (optionCount >= 2) return "multiple-choice";
  if (hint === "open-ended") return "open-ended";
  if (hint === "short-answer") return "short-answer";
  // The sheet lists choices, but not in a way the options columns could take
  // ("1) as 2) if"): still a choice question, just not a finished one.
  if (hint === "choices") return "multiple-choice";
  return "short-answer";
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
 * Folds a name down to plain lowercase letters so "Qrammatika", "QRAMMATİKA"
 * and "qrammatika" are one word, and the Azerbaijani letters match the
 * English-keyboard way of typing them. Used to recognise topic names only.
 */
function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/̇/g, "")
    .replace(/ə/g, "e")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Topic names as Nihad's workbook, and a Russian one, write them, and the
 * starter topic each means. Only used when the subject has that topic, so
 * "Probability" is `probability` in maths and a new topic anywhere else.
 */
const topicNames: Record<string, string[]> = {
  grammar: ["qrammatika", "grammar", "грамматика"],
  reading: ["oxu / metn", "oxu", "metn", "oxu/metn", "reading", "reading comprehension", "чтение", "текст", "чтение / текст"],
  vocabulary: ["leksika", "vocabulary", "лексика", "словарный запас"],
  spelling: ["orfoqrafiya", "spelling", "орфография"],
  punctuation: ["durgu isareleri", "punktuasiya", "punctuation", "пунктуация"],
  phonetics: ["fonetika", "phonetics", "фонетика"],
  writing: ["yazi", "writing", "письмо"],
  "sets-logic": ["sets & logic", "sets and logic", "множества и логика"],
  probability: ["probability", "ehtimal", "ehtimal ve statistika", "вероятность", "вероятность и статистика"],
  algebra: ["cebr", "алгебра"],
  geometry: ["həndəsə", "hendese", "геометрия"],
  arithmetic: ["hesab", "арифметика"]
};

/**
 * The topic id a cell means.
 *
 * Nihad's workbook writes "<subject> / <topic>" ("Azərbaycan dili / Qrammatika"),
 * so a leading subject name is dropped first. A topic that is only the subject's
 * own name ("Riyaziyyat" under Mathematics) says nothing about what the question
 * covers, so those go into one topic called `general` rather than a topic named
 * after the subject. Anything the starter list does not know becomes a new topic,
 * as it always has.
 */
function resolveTopic(rawTopic: string, subjectId: string): string {
  const subject = subjects.find((item) => item.id === subjectId);
  const known = subject?.topics ?? [];

  let typed = rawTopic.trim();
  const slash = typed.indexOf("/");
  if (slash > 0 && resolveSubject(typed.slice(0, slash)) !== null && typed.slice(slash + 1).trim().length > 0) {
    typed = typed.slice(slash + 1).trim();
  }

  if (resolveSubject(typed) !== null) return "general";

  const folded = fold(typed);
  for (const [id, names] of Object.entries(topicNames)) {
    if (known.some((topic) => topic.id === id) && names.map(fold).includes(folded)) return id;
  }
  return topicIdFor(typed, known);
}

/** A date as the workbook writes it, "05.04.2026" (or 2026-04-05, 5/4/2026). */
function parseSheetDate(value: string): { iso: string; display: string; year: number } | null {
  const text = value.trim();
  let year: number;
  let month: number;
  let day: number;

  const dotted = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(text);
  if (dotted) {
    day = Number(dotted[1]);
    month = Number(dotted[2]);
    year = Number(dotted[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const two = (n: number) => String(n).padStart(2, "0");
  return { iso: `${year}-${two(month)}-${two(day)}`, display: `${two(day)}.${two(month)}.${year}`, year };
}

/** The question number from a Q# cell; Excel writes 37 as "37.0". */
function parseQuestionNumber(value: string): number | null {
  const match = /^(\d+)(?:[.,]0+)?$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

const slugOf = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * "A, D", "A;D" and "AD" all mean options A and D. Null when the cell is not a
 * list of letters at all, or names a letter twice.
 */
function parseAnswerLetters(raw: string): string[] | null {
  const compact = raw.toUpperCase().replace(/[\s,;/&+.()]/g, "");
  if (!/^[A-E]+$/.test(compact)) return null;
  const letters = compact.split("");
  return new Set(letters).size === letters.length ? letters : null;
}

/**
 * The options of an "Answer Options (full)" cell, when it is a clean lettered
 * list ("A) x" on its own lines, A first, no gaps). Anything else is left alone
 * rather than guessed at: a wrong option in front of students is worse than a
 * question waiting as a draft.
 */
function parseLetteredOptions(text: string): string[] | null {
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length < 2 || lines.length > 5) return null;

  const options: string[] = [];
  for (const [index, line] of lines.entries()) {
    const match = /^\(?([A-Ea-e])[).]\s*(.+)$/.exec(line);
    if (!match || match[1].toUpperCase().charCodeAt(0) - 65 !== index) return null;
    options.push(match[2].trim());
  }
  return options;
}

/** Whether a correct-answer cell says the official key leaves this question out. */
const keyNotPublished = (raw: string) => /не опубликован|нет ключа|not published|açıqlanmayıb/i.test(raw);

/**
 * One row that came through the import, in the same order as `drafts`, with what
 * a draft itself does not carry.
 */
export interface ImportedRow {
  row: number;
  /** `draft` when something is still missing: options, the key, the passage text. */
  status: "ready" | "draft";
  /** Why a row is a draft, in plain English, or null for a ready row. */
  reason: string | null;
  subtopic: string | null;
  /** The question's paper and number ("dim-2026-04-05-az-c:q37"), or null when the sheet gives no date, variant and Q#. */
  externalRef: string | null;
  /** The sheet's id of the passage the question is about ("05-P1"), or null. */
  passageRef: string | null;
  /** Where the question comes among the questions on that passage, counted from 1. */
  passageOrder: number | null;
}

/** A passage a question row carries the text of, to be created or updated by its sheet id. */
export interface ImportedPassage {
  row: number;
  externalRef: string;
  draft: PassageDraft;
}

export interface ImportOptions {
  /**
   * Save a row that is missing something (options, a published key, the
   * passage text) as a draft instead of leaving it out. Off by default, so an
   * import behaves as it always did unless the caller asks.
   */
  keepDrafts?: boolean;
  /**
   * Which image_url values are links to a picture, as the admin form's own
   * save does (see pictureLinks.ts). Without it only https:// links are taken.
   */
  pictureLinks?: PictureLinkRules;
}

/**
 * Reads a sheet of questions. See ImportOptions for the two settings.
 *
 * With keepDrafts, a row that has a subject, a topic and question text but is
 * not yet answerable comes through with status "draft" and a reason, instead of
 * being reported as an error. Rows that cannot be a question at all (no text,
 * unknown subject, a bad year) are errors either way.
 */
export function importQuestionsFromCsv(csv: string, options: ImportOptions = {}): ImportResult {
  const pictureLinks = options.pictureLinks ?? httpsPicturesOnly;
  const keepDrafts = options.keepDrafts === true;
  const { rows, unterminatedRow } = readSheetRows(csv);
  const drafts: QuestionDraft[] = [];
  const draftRows: number[] = [];
  const imported: ImportedRow[] = [];
  const passages: ImportedPassage[] = [];
  const errors: ImportRowError[] = [];
  const done = (extra: Partial<ImportResult> = {}): ImportResult => ({
    drafts,
    draftRows,
    rows: imported,
    passages,
    errors,
    ...extra
  });

  if (unterminatedRow !== undefined) {
    errors.push({
      row: unterminatedRow,
      message: `A quote opened in this row is never closed, so this row and the ones after it were not read. Close the quote, or remove it if it is part of the text.`
    });
  }

  if (rows.length === 0) {
    if (errors.length > 0) return done();
    errors.push({ row: 0, message: "The pasted text was empty." });
    return done();
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

    errors.push({
      row: headerRow.row,
      message: `Missing column(s): ${columns.join(", ")}. The header row needs at least subject, topic, question and correct_answer.`
    });
    return done({ headerProblem: true });
  }

  // A header with nothing under it imported nothing and said only "Imported 0
  // questions.", with no reason. Blank rows are gone by now, so a header with
  // only those below it is the same. A quote left open below the header has
  // already said why its rows were not read.
  if (dataRows.length === 0 && errors.length === 0) {
    errors.push({ row: headerRow.row, message: "There are no question rows under the header row." });
    return done({ headerProblem: true });
  }

  const cell = (row: string[], field: string): string => {
    const columnIndex = mapping[field];
    if (columnIndex === undefined) return "";
    return (row[columnIndex] ?? "").trim();
  };

  // The Q# of each row that is on a passage, to put the questions in order.
  const orderKeys: Array<number | null> = [];
  const passageTexts = new Set<string>();

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
    // A topic's name means the topic: "Functions and Graphs" is `functions`,
    // and Nihad's "Azərbaycan dili / Qrammatika" is `grammar`. Only a topic the
    // subject does not have becomes a new id.
    const topicId = resolveTopic(rawTopic, subjectId);
    // Held to the length a test can ask for, as the admin form is: a longer
    // topic would import but never be drawn into a paper.
    if (topicId.length > testScopeLimits.maxIdLength) {
      errors.push({ row: rowNumber, message: `Topic is longer than ${testScopeLimits.maxIdLength} characters.` });
      return;
    }

    // What is still missing on this row, in words. Only ever filled when
    // keepDrafts is on; otherwise the same problem is an error and the row stops.
    const reasons: string[] = [];
    const incomplete = (error: string, reason: string): boolean => {
      if (!keepDrafts) {
        errors.push({ row: rowNumber, message: error });
        return true;
      }
      reasons.push(reason);
      return false;
    };

    const optionCells = [
      cell(row, "optionA"),
      cell(row, "optionB"),
      cell(row, "optionC"),
      cell(row, "optionD"),
      cell(row, "optionE")
    ];

    // The "Answer Options (full)" column is a second place for the options,
    // used only when the A to E columns are empty and the text is a clean
    // lettered list. Otherwise it is read for what it says about the kind of
    // question: a written answer, a short answer, or a list of choices.
    const fullOptions = (mapping.optionsFull === undefined ? "" : (row[mapping.optionsFull] ?? "")).trim();
    let hint: OptionsHint = null;
    if (optionCells.every((option) => option.length === 0) && fullOptions.length > 0) {
      const lettered = parseLetteredOptions(fullOptions);
      if (lettered) {
        lettered.forEach((option, index) => {
          optionCells[index] = option;
        });
      } else if (/open-ended|yazılı açıq cavab/i.test(fullOptions)) {
        hint = "open-ended";
      } else if (/short-answer|short answer/i.test(fullOptions)) {
        hint = "short-answer";
      } else {
        hint = "choices";
      }
    }
    const options = optionCells.filter((option) => option.length > 0);

    const rawAnswer = cell(row, "correctAnswer");
    const type = parseType(cell(row, "type"), options.length, hint);
    const choiceType = type === "multiple-choice" || type === "multiple-select";

    // A question that lists its choices (the type column says so, or the key is
    // a letter) but has fewer than two of them cannot be answered yet.
    let missingOptions = false;
    if (choiceType && options.length < 2) {
      if (
        incomplete(
          type === "multiple-select"
            ? "Multiple select needs at least two options in option_a / option_b."
            : "Multiple choice needs at least two options in option_a / option_b.",
          "no options yet: the A to E columns are empty and the options could not be read from Answer Options (full)"
        )
      ) {
        return;
      }
      missingOptions = true;
    }

    // Held to the same rule as the admin form: two options reading the same
    // would both be marked right, or both wrong.
    const repeated = choiceType ? repeatedOption(options) : null;
    if (repeated !== null) {
      errors.push({ row: rowNumber, message: `Two options are the same ("${repeated}"). Each option has to be different.` });
      return;
    }

    const answerOptions = choiceType ? optionCells : [];

    if (type !== "multiple-select" && isAmbiguousLetterAnswer(rawAnswer, answerOptions)) {
      const letter = rawAnswer.toUpperCase();
      errors.push({
        row: rowNumber,
        message: `Correct answer "${rawAnswer}" could be option ${letter} or the option that reads "${rawAnswer}". Write the right option's letter in brackets instead, such as "(${letter})".`
      });
      return;
    }

    let correctAnswer = "";
    if (!missingOptions) {
      let answerError: string | null = null;
      let answerReason = "";

      if (keyNotPublished(rawAnswer)) {
        answerError = `Correct answer "${rawAnswer}" says the key is not published, so there is no answer to save.`;
        answerReason =
          type === "open-ended"
            ? "written answer has no marking guide: the official key does not publish one"
            : "key not published: the official key does not give this answer";
      } else if (type === "multiple-select") {
        const letters = parseAnswerLetters(rawAnswer);
        const chosen = letters?.map((letter) => optionCells[letter.charCodeAt(0) - 65] ?? "") ?? [];
        if (letters === null || chosen.some((option) => option.length === 0)) {
          answerError = `Correct answer "${rawAnswer}" does not match any of the options.`;
          answerReason =
            rawAnswer.length === 0
              ? "no correct answers ticked yet"
              : `the correct answers "${rawAnswer}" are not letters of options that exist (write them like A, D)`;
        } else {
          correctAnswer = encodeAnswerSet(options, chosen);
        }
      } else {
        const resolved = resolveCorrectAnswer(rawAnswer, answerOptions);
        if (resolved !== null) {
          correctAnswer = resolved;
        } else {
          answerError = `Correct answer "${rawAnswer}" does not match any of the options.`;
          const letter = /^\(?([a-eA-E])\)?[.)]?$/.exec(rawAnswer);
          if (rawAnswer.length === 0) {
            answerReason =
              type === "open-ended" ? "written answer has no marking guide yet" : "no correct answer in the key yet";
          } else if (letter) {
            answerReason = `the key says ${letter[1].toUpperCase()} but option ${letter[1].toUpperCase()} is empty`;
          } else if (/^\d+\.\d+$/.test(rawAnswer)) {
            answerReason = `Excel turned the answer ${rawAnswer.replace(".", ",")} into ${rawAnswer}; check the key`;
          } else {
            answerReason = `the key "${rawAnswer}" does not match any option`;
          }
        }
      }

      if (answerError !== null && incomplete(answerError, answerReason)) return;
    } else if (/^\d+\.\d+$/.test(rawAnswer)) {
      // Choices listed as 1) 2) 3) with a key of "1.4": Excel's doing, and said
      // so rather than only "no options".
      reasons.push(`Excel turned the answer ${rawAnswer.replace(".", ",")} into ${rawAnswer}; check the key`);
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

    // Blank means the year is not known, unless the sheet gives the paper's
    // date, which then says it. Anything else is held to the rule the
    // admin form and the API apply, like marks above: parseInt read "2024.5" as
    // 2024 and "20 24" as 20, and a number too big for the column failed the
    // whole import instead of this one row.
    const date = parseSheetDate(cell(row, "date"));
    const rawYear = cell(row, "paperYear");
    const paperYear = rawYear.length === 0 ? (date?.year ?? null) : parseWholeNumber(rawYear);

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

    const draftOptions = choiceType ? options : [];

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
    // A row still waiting on its options or key is checked when it is finished
    // in the admin form, where the rest of it is there to compare against.
    if (reasons.length === 0) {
      translationError ??=
        translationProblems({ subjectId, type, options: draftOptions, correctAnswer, translations })[0]?.message ?? null;
    }

    if (translationError) {
      errors.push({ row: rowNumber, message: translationError });
      return;
    }

    // Where the question comes from, in words and as a key. The key is what
    // lets the same sheet be imported again to fix a row: a row whose key is
    // already in the bank updates that question rather than adding a second.
    const number = parseQuestionNumber(cell(row, "number"));
    const sector = cell(row, "sector");
    const variant = cell(row, "variant");
    let source = cell(row, "source") || null;
    if (date) {
      source = [
        `DİM ${date.display}`,
        sector ? `${sector} sector` : "",
        variant ? `Variant ${variant}` : "",
        number !== null ? `Q${number}` : ""
      ]
        .filter((part) => part.length > 0)
        .join(", ");
    }
    const externalRef =
      date && number !== null && slugOf(sector).length > 0 && slugOf(variant).length > 0
        ? `dim-${date.iso}-${slugOf(sector)}-${slugOf(variant)}:q${number}`
        : null;

    // The passage the question is about. The first row of a passage that
    // carries its text creates or updates it; the others only point at it.
    const passageRef = cell(row, "passageRef") || null;
    if (passageRef !== null && !passageTexts.has(passageRef)) {
      const body = cell(row, "passageBody");
      if (body.length > 0) {
        if (body.length > passageLimits.bodyMax) {
          errors.push({
            row: rowNumber,
            message: `Passage ${passageRef} is longer than ${passageLimits.bodyMax} characters, so it was not saved.`
          });
        } else {
          passageTexts.add(passageRef);
          passages.push({
            row: rowNumber,
            externalRef: passageRef,
            draft: {
              subjectId,
              title: (cell(row, "passageTitle") || passageRef).slice(0, passageLimits.titleMax),
              body,
              paperYear,
              source: date
                ? [`DİM ${date.display}`, sector ? `${sector} sector` : "", variant ? `Variant ${variant}` : ""]
                    .filter((part) => part.length > 0)
                    .join(", ")
                : cell(row, "source") || null
            }
          });
        }
      }
    }

    orderKeys.push(number);
    draftRows.push(rowNumber);
    imported.push({
      row: rowNumber,
      status: reasons.length > 0 ? "draft" : "ready",
      reason: reasons.length > 0 ? reasons.join("; ") : null,
      subtopic: cell(row, "subtopic") || null,
      externalRef,
      passageRef,
      passageOrder: null
    });
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
      source,
      translations,
      passageId: null,
      passageOrder: null
    });
  });

  // Questions on one passage are served in the order of their numbers. Counted
  // from 1 within the passage, so it does not matter that the paper numbers
  // them 37 to 46; a row with no number follows the numbered ones, in sheet order.
  const byPassage = new Map<string, number[]>();
  imported.forEach((entry, index) => {
    if (entry.passageRef === null) return;
    byPassage.set(entry.passageRef, [...(byPassage.get(entry.passageRef) ?? []), index]);
  });
  for (const indexes of byPassage.values()) {
    indexes
      .sort((a, b) => (orderKeys[a] ?? Number.MAX_SAFE_INTEGER) - (orderKeys[b] ?? Number.MAX_SAFE_INTEGER) || a - b)
      .forEach((index, position) => {
        imported[index].passageOrder = position + 1;
      });
  }

  return done();
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

/** A question ready to be saved: the draft, how finished it is, and its sheet key. */
export interface PlannedQuestion {
  row: number;
  draft: QuestionDraft;
  status: "ready" | "draft";
  subtopic: string | null;
  externalRef: string | null;
  /** Why the question is a draft, in plain English, or null when it is ready. */
  reason: string | null;
}

/**
 * Decides what is saved from what the sheet held, once the passages the rows
 * point at are known.
 *
 * - A row on a passage is linked to it, in its order among that passage's
 *   questions. If the passage is not in the bank, the question cannot be
 *   answered without its text: with keepDrafts it is saved as a draft that says
 *   so, without it the row is reported as an error.
 * - A row with a sheet key is saved by that key, which updates the question
 *   already holding it. Only a key repeated inside one paste leaves the later
 *   row out.
 * - A row without a key is left out if the same question is already in the
 *   bank or earlier in the paste, as it always was (see withoutDuplicates).
 *
 * `passages` holds the bank's passages by the sheet's id for them.
 */
export function planImport(
  result: Pick<ImportResult, "drafts" | "rows">,
  context: {
    bank: Array<Parameters<typeof questionKey>[0]>;
    passages: ReadonlyMap<string, Pick<Passage, "id">>;
    keepDrafts: boolean;
  }
): { items: PlannedQuestion[]; duplicateRows: number[]; errors: ImportRowError[] } {
  const seen = new Set(context.bank.map(questionKey));
  const refsSeen = new Set<string>();
  const items: PlannedQuestion[] = [];
  const duplicateRows: number[] = [];
  const errors: ImportRowError[] = [];

  result.drafts.forEach((original, index) => {
    const info = result.rows[index];
    const draft: QuestionDraft = { ...original };
    const reasons = info.reason === null ? [] : [info.reason];

    if (info.passageRef !== null) {
      const passage = context.passages.get(info.passageRef);
      if (passage) {
        draft.passageId = passage.id;
        draft.passageOrder = info.passageOrder;
      } else if (context.keepDrafts) {
        reasons.push(`passage ${info.passageRef} not in the bank yet; import the Reading texts sheet`);
      } else {
        errors.push({
          row: info.row,
          message: `Passage ${info.passageRef} is not in the bank yet, so the question cannot be shown. Import the Reading texts sheet first.`
        });
        return;
      }
    }

    if (info.externalRef !== null) {
      if (refsSeen.has(info.externalRef)) {
        duplicateRows.push(info.row);
        return;
      }
      refsSeen.add(info.externalRef);
    } else {
      const key = questionKey(draft);
      if (seen.has(key)) {
        duplicateRows.push(info.row);
        return;
      }
      seen.add(key);
    }

    items.push({
      row: info.row,
      draft,
      status: reasons.length > 0 ? "draft" : info.status,
      subtopic: info.subtopic,
      externalRef: info.externalRef,
      reason: reasons.length > 0 ? reasons.join("; ") : null
    });
  });

  return { items, duplicateRows, errors };
}

/** One passage read from a Reading texts sheet. */
export interface SheetPassage {
  row: number;
  externalRef: string;
  draft: PassageDraft;
  /** False when the sheet has no subject column and the subject is a guess. */
  subjectGiven: boolean;
}

export interface PassageImportResult {
  passages: SheetPassage[];
  errors: ImportRowError[];
  headerProblem?: true;
}

const passageHeaderAliases: Record<string, string[]> = {
  ref: ["id_текста", "passage_id", "passage_ref", "passageid", "ref", "id"],
  title: ["название", "title", "passage_title", "name"],
  body: ["полный_текст_/_перепечатка", "полный_текст", "passage_text", "passage_body", "text", "body", "passage"],
  date: ["дата", "date"],
  variant: ["вариант", "variant"],
  sector: ["sector", "сектор"],
  subject: ["subject", "предмет"]
};

/** Columns only a sheet of questions has. A sheet with one of them is questions, not passages. */
const questionOnlyHeaders = [
  "question",
  "prompt",
  "question_text",
  "question_(original_az)",
  "correct_answer",
  "correct_answer_(dim)",
  "correctanswer"
];

function passageColumns(headerCells: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  headerCells.forEach((raw, columnIndex) => {
    const header = normalizeHeader(raw);
    for (const [field, aliases] of Object.entries(passageHeaderAliases)) {
      if (aliases.includes(header) && mapping[field] === undefined) mapping[field] = columnIndex;
    }
  });
  return mapping;
}

/**
 * Whether a pasted sheet is a list of reading passages (Nihad's "Reading texts"
 * sheet, or English passage_id, title, text) rather than questions: it has a
 * passage id column and a text column, and no question or answer column.
 */
export function looksLikePassageSheet(csv: string): boolean {
  const first = readSheetRows(csv).rows[0];
  if (!first) return false;
  const headers = first.cells.map(normalizeHeader);
  const mapping = passageColumns(first.cells);
  return (
    mapping.ref !== undefined &&
    mapping.body !== undefined &&
    !headers.some((header) => questionOnlyHeaders.includes(header))
  );
}

/** A guess at the subject of a text from its letters, for a sheet that does not say. */
function guessPassageSubject(text: string): string {
  if (/[а-яё]/i.test(text)) return "russian";
  if (/[əğıöüşç]/i.test(text)) return "azerbaijani";
  return (text.match(/\b(the|and|was|were)\b/gi) ?? []).length >= 3 ? "english" : "azerbaijani";
}

/**
 * Reads a Reading texts sheet: one passage per row, keyed by its id ("05-P1"),
 * so importing it again updates the passages rather than adding copies.
 */
export function importPassagesFromCsv(csv: string): PassageImportResult {
  const { rows, unterminatedRow } = readSheetRows(csv);
  const passages: SheetPassage[] = [];
  const errors: ImportRowError[] = [];

  if (unterminatedRow !== undefined) {
    errors.push({
      row: unterminatedRow,
      message:
        "A quote opened in this row is never closed, so this row and the ones after it were not read. Close the quote, or remove it if it is part of the text."
    });
  }
  if (rows.length === 0) {
    if (errors.length === 0) errors.push({ row: 0, message: "The pasted text was empty." });
    return { passages, errors };
  }

  const [headerRow, ...dataRows] = rows;
  const mapping = passageColumns(headerRow.cells);
  if (mapping.ref === undefined || mapping.body === undefined) {
    errors.push({
      row: headerRow.row,
      message:
        "Missing column(s): passage_id, text. A Reading texts sheet needs an id column (ID текста or passage_id) and the text (Полный текст or text)."
    });
    return { passages, errors, headerProblem: true };
  }
  if (dataRows.length === 0 && errors.length === 0) {
    errors.push({ row: headerRow.row, message: "There are no passage rows under the header row." });
    return { passages, errors, headerProblem: true };
  }

  const cell = (row: string[], field: string) =>
    mapping[field] === undefined ? "" : (row[mapping[field]] ?? "").trim();
  const firstRowOf = new Map<string, number>();

  for (const { row: rowNumber, cells: row } of dataRows) {
    const externalRef = cell(row, "ref");
    const body = cell(row, "body");
    if (externalRef.length === 0) {
      errors.push({ row: rowNumber, message: "Passage id is empty." });
      continue;
    }
    if (body.length === 0) {
      errors.push({ row: rowNumber, message: `Passage ${externalRef} has no text.` });
      continue;
    }
    if (body.length > passageLimits.bodyMax) {
      errors.push({
        row: rowNumber,
        message: `Passage ${externalRef} is longer than ${passageLimits.bodyMax} characters.`
      });
      continue;
    }
    const earlier = firstRowOf.get(externalRef);
    if (earlier !== undefined) {
      errors.push({ row: rowNumber, message: `Passage id ${externalRef} is already used in row ${earlier}.` });
      continue;
    }
    firstRowOf.set(externalRef, rowNumber);

    const rawSubject = cell(row, "subject");
    const given = rawSubject.length > 0 ? resolveSubject(rawSubject) : null;
    if (rawSubject.length > 0 && given === null) {
      errors.push({
        row: rowNumber,
        message: `Subject "${rawSubject}" is not one of ${subjects.map((subject) => subject.id).join(", ")}.`
      });
      continue;
    }

    const date = parseSheetDate(cell(row, "date"));
    const sector = cell(row, "sector");
    const variant = cell(row, "variant");
    passages.push({
      row: rowNumber,
      externalRef,
      subjectGiven: given !== null,
      draft: {
        subjectId: given ?? guessPassageSubject(body),
        title: (cell(row, "title") || externalRef).slice(0, passageLimits.titleMax),
        body,
        paperYear: date?.year ?? null,
        source: date
          ? [`DİM ${date.display}`, sector ? `${sector} sector` : "", variant ? `Variant ${variant}` : ""]
              .filter((part) => part.length > 0)
              .join(", ")
          : null
      }
    });
  }

  return { passages, errors };
}
