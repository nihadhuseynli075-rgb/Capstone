/**
 * The Bulk import templates, in the two layouts Nihad keeps his questions in.
 *
 * - Azerbaijani Language: the one-table sheet with English column names
 *   (DIM_2026_AZ_ONE_TABLE_ENGLISH_COLUMNS.xlsx): one column per option.
 * - English, Maths and Russian: the 12 and 26 April workbook
 *   (Questions_12_and_26_April_2026_ENGLISH_ALL_OPTIONS.xlsm): every option in
 *   one "Answer Options" cell, one per line. The template adds the passage,
 *   Variant and Sector columns that workbook did not have yet.
 *
 * Each header is one the importer already reads (apps/api/src/services/
 * questionImport.ts), so a template filled in, or a sheet of Nihad's own
 * exported as CSV, goes straight back through Bulk import. A passage is
 * matched by its title within one paper (date, sector, variant): every
 * question about it carries the title, and the text goes on the first of them.
 */

export type TemplateSubjectId = "math" | "english" | "russian" | "azerbaijani";
export type TemplateLayoutId = "one-table" | "answer-options";

interface TemplateColumn {
  header: string;
  required: boolean;
  note: string;
}

/** One example question, in the words of a sheet rather than the bank. */
interface Example {
  number: string;
  topic: string;
  subtopic: string;
  question: string;
  difficulty: string;
  options: string[];
  answer: string;
  passageTitle?: string;
  passageText?: string;
  image?: string;
}

interface Layout {
  id: TemplateLayoutId;
  /** Where the layout comes from, for the page and the AI instruction. */
  origin: string;
  columns: TemplateColumn[];
  /** One example question as the cells of a row, in column order. */
  row: (subjectId: TemplateSubjectId, example: Example) => string[];
}

const SUBJECT_NAMES: Record<TemplateSubjectId, string> = {
  math: "Mathematics",
  english: "English",
  russian: "Russian",
  azerbaijani: "Azerbaijani Language"
};

/**
 * The paper the example rows say they come from: made up on purpose. A date,
 * variant, sector and number together are a question's key, so an example on a
 * real paper (12.04.2026, variant A) imported by mistake would overwrite that
 * paper's real question with the same number. Each subject's examples are
 * numbered in their own hundred for the same reason: the key has no subject.
 */
const EXAMPLE_PAPER = { date: "01.01.2026", writtenDate: "1 January 2026", variant: "T" };
const EXAMPLE_NUMBER_BASE: Record<TemplateSubjectId, number> = { math: 100, english: 200, russian: 300, azerbaijani: 400 };

const passageColumns: TemplateColumn[] = [
  {
    header: "Passage Title",
    required: false,
    note: "The passage's title, on EVERY question about that passage. Questions of one paper with the same title share one passage."
  },
  {
    header: "Passage / Text Related to the Question",
    required: false,
    note: "The whole passage text, on the first question about it (repeating it on each is fine too). Blank for questions without a passage."
  }
];

const imageColumn: TemplateColumn = {
  header: "Image",
  required: false,
  note: "Blank if the question has no picture. If it has one, write \"picture\": it imports as a draft until the picture is attached in the admin form. A full https:// link to the picture also works."
};

const ONE_TABLE: Layout = {
  id: "one-table",
  origin: "the Azerbaijani one-table sheet (English column names)",
  columns: [
    { header: "Question Number", required: false, note: "The number on the paper. Sets the order of a passage's questions." },
    { header: "Subject", required: true, note: "Azerbaijani Language" },
    { header: "Topic", required: true, note: "Grammar, Reading / Passage, Vocabulary, Spelling, Punctuation, Phonetics, Writing" },
    { header: "Subtopic", required: false, note: "Multiple choice or Open response (the kind of question), or a subtopic" },
    { header: "Question", required: true, note: "The question text exactly as on the paper" },
    { header: "Difficulty", required: false, note: "1 easy, 2 medium, 3 hard. Blank is medium." },
    { header: "Option A", required: false, note: "First option, without the letter" },
    { header: "Option B", required: false, note: "Second option" },
    { header: "Option C", required: false, note: "Third option" },
    { header: "Option D", required: false, note: "Fourth option" },
    { header: "Option E", required: false, note: "Fifth option" },
    { header: "Answer Options (Raw)", required: false, note: "Optional: the options as on the paper, A) ... one per line. Used only when Option A to E are empty." },
    { header: "Correct Answer", required: true, note: "The letter (A to E). For an open response, the marking guide. Not published yet: leave the official wording, it imports as a draft." },
    ...passageColumns,
    imageColumn,
    { header: "Date", required: false, note: "05.04.2026. With Variant, Sector and Question Number, importing again updates instead of adding copies." },
    { header: "Variant", required: false, note: "A, B, C or D" },
    { header: "Sector", required: false, note: "AZ" },
    { header: "Source", required: false, note: "Where the question comes from" },
    { header: "Notes", required: false, note: "Anything for yourself. Not imported." },
    { header: "Official Source URL", required: false, note: "Link to the official paper. Not imported." }
  ],
  row: (subjectId, example) => [
    String(EXAMPLE_NUMBER_BASE[subjectId] + Number(example.number)),
    SUBJECT_NAMES[subjectId],
    example.topic,
    example.subtopic,
    example.question,
    example.difficulty,
    ...[0, 1, 2, 3, 4].map((index) => example.options[index] ?? ""),
    "",
    example.answer,
    example.passageTitle ?? "",
    example.passageText ?? "",
    example.image ?? "",
    EXAMPLE_PAPER.date,
    EXAMPLE_PAPER.variant,
    "AZ",
    "Template example",
    "",
    ""
  ]
};

const ANSWER_OPTIONS: Layout = {
  id: "answer-options",
  origin: "the 12 and 26 April workbook",
  columns: [
    { header: "Q#", required: false, note: "The number on the paper. Sets the order of a passage's questions." },
    { header: "Subject", required: true, note: "English, Mathematics or Russian" },
    { header: "Topic", required: true, note: "e.g. Grammar, Reading, Vocabulary, Algebra, Geometry. A new topic is accepted." },
    { header: "Subtopic", required: false, note: "Free text, e.g. Passive voice" },
    { header: "Question (English)", required: true, note: "The question text exactly as on the paper (in Russian for Russian questions)" },
    { header: "Difficulty", required: false, note: "1 easy, 2 medium, 3 hard. Blank is medium." },
    { header: "Answer Options", required: false, note: "Every option in this one cell, one per line: A) ... B) ... up to E). Blank for short and written answers." },
    { header: "Correct Answer", required: true, note: "The letter (A to E), or the answer itself for a short answer, without units or signs (115, not 115°)." },
    ...passageColumns,
    imageColumn,
    { header: "Date", required: false, note: "12 April 2026 (or 12.04.2026). With Variant, Sector and Q#, importing again updates instead of adding copies." },
    { header: "Variant", required: false, note: "A, B, C or D" },
    { header: "Sector", required: false, note: "RU or AZ" },
    { header: "Status", required: false, note: "Anything for yourself. Not imported." },
    { header: "Source", required: false, note: "Where the question comes from" }
  ],
  row: (subjectId, example) => [
    String(EXAMPLE_NUMBER_BASE[subjectId] + Number(example.number)),
    SUBJECT_NAMES[subjectId],
    example.topic,
    example.subtopic,
    example.question,
    example.difficulty,
    example.options.map((option, index) => `${String.fromCharCode(65 + index)}) ${option}`).join("\n"),
    example.answer,
    example.passageTitle ?? "",
    example.passageText ?? "",
    example.image ?? "",
    EXAMPLE_PAPER.writtenDate,
    EXAMPLE_PAPER.variant,
    "RU",
    "",
    "Template example"
  ]
};

const LAYOUTS: Record<TemplateLayoutId, Layout> = { "one-table": ONE_TABLE, "answer-options": ANSWER_OPTIONS };

export function templateLayout(subjectId: TemplateSubjectId): Layout {
  return LAYOUTS[subjectId === "azerbaijani" ? "one-table" : "answer-options"];
}

/**
 * Example rows per subject, worded for the template so nothing is copied from
 * a paper. Each language subject shows one passage with three questions: the
 * title on all three, the text on the first only.
 */
const EXAMPLES: Record<TemplateSubjectId, Example[]> = {
  math: [
    {
      number: "1", topic: "Algebra", subtopic: "Linear equations", difficulty: "1",
      question: "Solve for x: 3x + 5 = 20", options: ["3", "5", "7", "15", "25"], answer: "B"
    },
    {
      number: "2", topic: "Geometry", subtopic: "Angles", difficulty: "2",
      question: "Two angles of a triangle are 40° and 25°. Find the third angle in degrees.", options: [], answer: "115"
    },
    {
      number: "3", topic: "Geometry", subtopic: "Similar triangles", difficulty: "2",
      question: "Triangles ABC and DEF in the picture are similar. Find x.", options: ["4", "6", "8", "9", "12"], answer: "C",
      image: "picture"
    }
  ],
  english: [
    {
      number: "1", topic: "Grammar", subtopic: "Present Simple", difficulty: "1",
      question: "Choose the correct option: She ... to school by bus every day.",
      options: ["go", "goes", "going", "gone", "is go"], answer: "B"
    },
    {
      number: "2", topic: "Reading", subtopic: "Detail", difficulty: "1",
      question: "When does the library club meet?",
      options: ["On Mondays", "On Wednesdays", "On Fridays", "Every day", "At weekends"], answer: "C",
      passageTitle: "The library club",
      passageText:
        "Our school library has started a reading club. It meets every Friday after lessons. Each week one student chooses a book and tells the others about it. Last week Leyla talked about a novel set in the mountains, and three people borrowed it the same day."
    },
    {
      number: "3", topic: "Reading", subtopic: "Detail", difficulty: "1",
      question: "Who talked about a book last week?",
      options: ["The librarian", "A teacher", "Leyla", "Three students", "Nobody"], answer: "C",
      passageTitle: "The library club"
    },
    {
      number: "4", topic: "Reading", subtopic: "Main idea", difficulty: "2",
      question: "What is the text mainly about?",
      options: ["A new reading club", "A trip to the mountains", "Rules of the library", "A book shop", "School lessons"], answer: "A",
      passageTitle: "The library club"
    }
  ],
  russian: [
    {
      number: "1", topic: "Grammar", subtopic: "Падежи", difficulty: "1",
      question: "В каком падеже стоит слово «книгу» в предложении «Я читаю книгу»?",
      options: ["именительный", "родительный", "дательный", "винительный", "предложный"], answer: "D"
    },
    {
      number: "2", topic: "Reading", subtopic: "Детали текста", difficulty: "1",
      question: "Куда пошла Аня утром?",
      options: ["в школу", "в парк", "на рынок", "к бабушке", "в библиотеку"], answer: "B",
      passageTitle: "Утро в парке",
      passageText:
        "В субботу Аня проснулась рано и пошла в парк. Там было тихо, только птицы пели на деревьях. Аня села на скамейку и открыла новую книгу. Через час к ней подошёл её брат с собакой."
    },
    {
      number: "3", topic: "Reading", subtopic: "Детали текста", difficulty: "1",
      question: "Кто подошёл к Ане через час?",
      options: ["подруга", "мама", "брат", "учитель", "сосед"], answer: "C",
      passageTitle: "Утро в парке"
    },
    {
      number: "4", topic: "Reading", subtopic: "Основная мысль", difficulty: "2",
      question: "Какое настроение у текста?",
      options: ["тревожное", "спокойное", "грустное", "весёлое и шумное", "торжественное"], answer: "B",
      passageTitle: "Утро в парке"
    }
  ],
  azerbaijani: [
    {
      number: "1", topic: "Grammar", subtopic: "Multiple choice", difficulty: "1",
      question: "Hansı söz isimdir?", options: ["gözəl", "kitab", "qaçmaq", "tez", "üç"], answer: "B"
    },
    {
      number: "2", topic: "Reading / Passage", subtopic: "Multiple choice", difficulty: "1",
      question: "Kənan bağda nə əkdi?", options: ["gül", "alma ağacı", "pomidor", "kartof", "üzüm"], answer: "B",
      passageTitle: "Bağda bir gün",
      passageText:
        "Bahar gələndə Kənan babası ilə bağa getdi. Onlar birlikdə bir alma ağacı əkdilər. Babası dedi ki, bu ağac bir neçə ildən sonra meyvə verəcək. Kənan hər həftə ağacı sulamağa söz verdi."
    },
    {
      number: "3", topic: "Reading / Passage", subtopic: "Multiple choice", difficulty: "1",
      question: "Kənan nə söz verdi?",
      options: ["ağacı hər həftə sulamağa", "bağa getməməyə", "alma almağa", "kitab oxumağa", "babasına kömək etməməyə"], answer: "A",
      passageTitle: "Bağda bir gün"
    },
    {
      number: "4", topic: "Reading / Passage", subtopic: "Open response", difficulty: "3",
      question: "Mətnə əsasən Kənanın babasından nə öyrəndiyini bir-iki cümlə ilə yazın.", options: [],
      answer: "Tam bal: şagird səbrin və qayğının bəhrə verdiyini mətndən misalla izah edir.",
      passageTitle: "Bağda bir gün"
    }
  ]
};

/** Quotes a cell the way spreadsheets export one: only when it holds a comma, quote or line break. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The template file for one subject. It starts with a byte order mark, because
 * Excel opens a UTF-8 file without one in the old encoding and shows every
 * Azerbaijani and Russian letter as nonsense; the importer drops the mark.
 */
export function templateCsv(subjectId: TemplateSubjectId): string {
  const layout = templateLayout(subjectId);
  const lines = [layout.columns.map((column) => csvCell(column.header)).join(",")];
  for (const example of EXAMPLES[subjectId]) {
    lines.push(layout.row(subjectId, example).map(csvCell).join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function templateFileName(subjectId: TemplateSubjectId): string {
  return `exampeak-import-template-${subjectId}.csv`;
}

export function templateSubjectName(subjectId: TemplateSubjectId): string {
  return SUBJECT_NAMES[subjectId];
}

/**
 * A ready-made instruction for an AI tool, to paste together with the admin's
 * own sheet and the template. It spells out the rules the importer applies, so
 * the converted file imports cleanly the first time rather than after a round
 * of row errors.
 */
export function templateAiInstruction(subjectId: TemplateSubjectId): string {
  const layout = templateLayout(subjectId);
  const columns = layout.columns
    .map((column) => `- ${column.header}${column.required ? " (required)" : ""}: ${column.note}`)
    .join("\n");
  const optionRule =
    layout.id === "one-table"
      ? "- Put each answer option in its own column, Option A to Option E, without the letter in front (\"7\", not \"A) 7\")."
      : "- Put all the options in the one Answer Options cell, one per line, each starting with its letter: A) ... B) ... C) ... D) ... E) ...";
  return [
    `Convert my question sheet (attached) into the ExamPeak import template for ${SUBJECT_NAMES[subjectId]} (also attached), which follows ${layout.origin}.`,
    "",
    "Output one CSV file, UTF-8, with exactly this header row and the columns in this order:",
    layout.columns.map((column) => csvCell(column.header)).join(","),
    "",
    "Columns:",
    columns,
    "",
    "Rules:",
    "- One row per question. Copy the question and option text exactly; do not translate, shorten or correct it.",
    optionRule,
    "- Correct Answer is the letter of the right option. For short answers, give the answer without units or signs (115, not 115°; 16, not 16 cm).",
    "- Passages: give every question about the same text the same Passage Title. Put the full passage text in \"Passage / Text Related to the Question\" on the first of those questions. Number the questions (the number column) so they keep the paper's order.",
    "- If a question has a picture, write \"picture\" in Image. Otherwise leave Image blank.",
    "- Leave a cell blank when the sheet has nothing for it. Never invent an answer, a difficulty or a passage.",
    "- Quote any cell that contains a comma, a quote mark or a line break.",
    "- Leave out the template's example rows (Source \"Template example\")."
  ].join("\n");
}

/** The columns of a subject's template, for the guide on the page. */
export function templateColumns(subjectId: TemplateSubjectId): ReadonlyArray<TemplateColumn> {
  return templateLayout(subjectId).columns;
}
