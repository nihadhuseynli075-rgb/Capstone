import type { Difficulty, QuestionDraft, QuestionType } from "@grade9/shared";

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
 * Minimal RFC 4180 CSV reader.
 *
 * Handles quoted fields, escaped quotes, commas and newlines inside quotes, and
 * both LF and CRLF line endings. Written out rather than pulled from a package
 * so the whole import path stays readable in one file.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  // A leading byte order mark survives most spreadsheet exports.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

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

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
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
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim().length > 0));
}

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
  correctAnswer: ["correct_answer", "answer", "correct", "correctanswer"],
  marks: ["marks", "mark", "points", "point", "weight"],
  explanation: ["explanation", "reason", "why"],
  imageUrl: ["image_url", "image", "picture", "imageurl"],
  paperYear: ["paper_year", "year", "paperyear"],
  source: ["source", "paper", "origin", "school"]
};

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

  return mapping;
}

const difficulties: Difficulty[] = ["easy", "medium", "hard"];

function parseDifficulty(value: string): Difficulty | null {
  const normalized = value.trim().toLowerCase();
  return difficulties.includes(normalized as Difficulty) ? (normalized as Difficulty) : null;
}

function parseType(value: string, optionCount: number): QuestionType {
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (normalized === "short-answer" || normalized === "short" || normalized === "text") {
    return "short-answer";
  }
  if (normalized === "multiple-choice" || normalized === "mcq" || normalized === "multiple") {
    return "multiple-choice";
  }
  // Blank type column: infer from whether options were supplied.
  return optionCount >= 2 ? "multiple-choice" : "short-answer";
}

/**
 * Resolves the correct answer to option text.
 *
 * Spreadsheets normally record the letter, but the bank stores the answer text
 * so that marking never has to care about option ordering.
 */
export function resolveCorrectAnswer(raw: string, options: string[]): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  if (options.length === 0) return value;

  const exact = options.find((option) => option === value);
  if (exact) return exact;

  const letterMatch = /^\(?([a-dA-D])\)?[.)]?$/.exec(value);
  if (letterMatch) {
    const position = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (position >= 0 && position < options.length) return options[position];
    return null;
  }

  const caseInsensitive = options.find(
    (option) => option.trim().toLowerCase() === value.toLowerCase()
  );
  return caseInsensitive ?? null;
}

export function importQuestionsFromCsv(csv: string): ImportResult {
  const rows = parseCsv(csv);
  const drafts: QuestionDraft[] = [];
  const errors: ImportRowError[] = [];

  if (rows.length === 0) {
    return { drafts, errors: [{ row: 0, message: "The pasted text was empty." }] };
  }

  const mapping = mapHeaders(rows[0]);

  const missing = ["subjectId", "topicId", "prompt", "correctAnswer"].filter(
    (field) => mapping[field] === undefined
  );

  if (missing.length > 0) {
    return {
      drafts,
      errors: [
        {
          row: 1,
          message: `Missing required column(s): ${missing.join(", ")}. Expected a header row containing at least subject, topic, question and correct_answer.`
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

    const options = [
      cell(row, "optionA"),
      cell(row, "optionB"),
      cell(row, "optionC"),
      cell(row, "optionD")
    ].filter((option) => option.length > 0);

    const type = parseType(cell(row, "type"), options.length);

    if (type === "multiple-choice" && options.length < 2) {
      errors.push({
        row: rowNumber,
        message: "Multiple choice needs at least two options in option_a / option_b."
      });
      return;
    }

    const correctAnswer = resolveCorrectAnswer(
      cell(row, "correctAnswer"),
      type === "multiple-choice" ? options : []
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
    const marks = rawMarks.length === 0 ? 1 : Number.parseInt(rawMarks, 10);

    if (!Number.isFinite(marks) || marks < 1) {
      errors.push({
        row: rowNumber,
        message: `Marks "${rawMarks}" is not a whole number of one or more.`
      });
      return;
    }

    const yearValue = Number.parseInt(cell(row, "paperYear"), 10);

    drafts.push({
      subjectId: cell(row, "subjectId").toLowerCase(),
      topicId: cell(row, "topicId").toLowerCase().replace(/\s+/g, "-"),
      difficulty: difficulty ?? "medium",
      type,
      prompt,
      options: type === "multiple-choice" ? options : [],
      correctAnswer,
      marks,
      explanation: cell(row, "explanation"),
      imageUrl: cell(row, "imageUrl") || null,
      paperYear: Number.isFinite(yearValue) ? yearValue : null,
      source: cell(row, "source") || null
    });
  });

  return { drafts, errors };
}
