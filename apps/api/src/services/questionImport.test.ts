import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decodeAnswerSet } from "@grade9/shared";
import {
  importPassagesFromCsv,
  importQuestionsFromCsv,
  looksLikePassageSheet,
  parseCsv,
  planImport,
  resolveCorrectAnswer,
  withoutDuplicates
} from "./questionImport";

const header = "subject,topic,question,option_a,option_b,option_c,option_d,correct_answer";

describe("parseCsv", () => {
  test("reads quoted fields, escaped quotes, and commas and newlines inside quotes", () => {
    const rows = parseCsv('a,"b, c","say ""hi""","line one\nline two"\n1,2,3,4');
    assert.deepEqual(rows, [
      ["a", "b, c", 'say "hi"', "line one\nline two"],
      ["1", "2", "3", "4"]
    ]);
  });

  test("handles CRLF line endings and a byte order mark", () => {
    assert.deepEqual(parseCsv("﻿a,b\r\nc,d\r\n"), [
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  test("drops blank rows", () => {
    assert.deepEqual(parseCsv("a,b\n\n , \nc,d"), [
      ["a", "b"],
      ["c", "d"]
    ]);
  });
});

describe("resolveCorrectAnswer", () => {
  const options = ["Paris", "London", "Rome", "Berlin"];

  test("turns a letter into the option text", () => {
    assert.equal(resolveCorrectAnswer("C", options), "Rome");
    assert.equal(resolveCorrectAnswer("b)", options), "London");
    assert.equal(resolveCorrectAnswer("(d)", options), "Berlin");
  });

  test("accepts the option text itself, in any case", () => {
    assert.equal(resolveCorrectAnswer("Paris", options), "Paris");
    assert.equal(resolveCorrectAnswer("london", options), "London");
  });

  test("a letter names its column even when an earlier option is blank", () => {
    assert.equal(resolveCorrectAnswer("C", ["Paris", "", "Rome", "Berlin"]), "Rome");
  });

  test("refuses a letter pointing at a blank option, or text matching nothing", () => {
    assert.equal(resolveCorrectAnswer("B", ["Paris", "", "Rome"]), null);
    assert.equal(resolveCorrectAnswer("Madrid", options), null);
    assert.equal(resolveCorrectAnswer("  ", options), null);
  });

  test("with no options, takes the answer as written", () => {
    assert.equal(resolveCorrectAnswer("42", []), "42");
  });
});

describe("importQuestionsFromCsv", () => {
  test("imports a multiple choice row, storing the answer as option text", () => {
    const { drafts, errors } = importQuestionsFromCsv(`${header}\nMath,Linear Equations,2x = 4,1,2,3,4,B`);

    assert.deepEqual(errors, []);
    assert.deepEqual(drafts, [
      {
        subjectId: "math",
        topicId: "linear-equations",
        difficulty: "medium",
        type: "multiple-choice",
        prompt: "2x = 4",
        options: ["1", "2", "3", "4"],
        correctAnswer: "2",
        marks: 1,
        explanation: "",
        imageUrl: null,
        paperYear: null,
        source: null,
        translations: {},
        passageId: null,
        passageOrder: null
      }
    ]);
  });

  test("infers a short answer question when no options are given", () => {
    const { drafts } = importQuestionsFromCsv("subject,topic,question,answer\nenglish,grammar,Past tense of go?,went");
    assert.equal(drafts[0].type, "short-answer");
    assert.equal(drafts[0].correctAnswer, "went");
    assert.deepEqual(drafts[0].options, []);
  });

  test("accepts header aliases and reads the optional columns", () => {
    const csv = [
      "Subject,Topic,Prompt,A,B,Correct,Level,Points,Why,Picture,Year,Paper",
      "russian,spelling,Pick one,да,нет,A,hard,3,Because,https://example.com/q.png,2024,DIM 2024"
    ].join("\n");

    const { drafts, errors } = importQuestionsFromCsv(csv);

    assert.deepEqual(errors, []);
    assert.equal(drafts[0].difficulty, "hard");
    assert.equal(drafts[0].marks, 3);
    assert.equal(drafts[0].explanation, "Because");
    assert.equal(drafts[0].imageUrl, "https://example.com/q.png");
    assert.equal(drafts[0].paperYear, 2024);
    assert.equal(drafts[0].source, "DIM 2024");
  });

  test("an empty paste is reported, not silently ignored", () => {
    const { drafts, errors } = importQuestionsFromCsv("  \n");
    assert.deepEqual(drafts, []);
    assert.equal(errors[0].message, "The pasted text was empty.");
  });

  test("a header with no rows under it is reported, not imported as nothing", () => {
    const { drafts, errors, headerProblem } = importQuestionsFromCsv(`${header}\n`);
    assert.deepEqual(drafts, []);
    assert.deepEqual(errors, [{ row: 1, message: "There are no question rows under the header row." }]);
    // So the dashboard does not also say a row was skipped.
    assert.equal(headerProblem, true);
  });

  test("a problem in a row of questions is not a problem with the header", () => {
    const { errors, headerProblem } = importQuestionsFromCsv(`${header}\nmath,algebra,,1,2,,,A`);
    assert.equal(errors.length, 1);
    assert.equal(headerProblem, undefined);
  });

  test("so is a header with only blank rows under it, against the header's own row", () => {
    const { drafts, errors } = importQuestionsFromCsv(`\r\n${header}\r\n\r\n,,,,,,,\r\n   \r\n`);
    assert.deepEqual(drafts, []);
    assert.deepEqual(errors, [{ row: 2, message: "There are no question rows under the header row." }]);
  });

  test("a quote left open under the header is the one problem reported", () => {
    const { drafts, errors } = importQuestionsFromCsv(`${header}\nmath,algebra,"never closed,1,2,,,A`);
    assert.deepEqual(drafts, []);
    assert.deepEqual(
      errors.map((error) => error.row),
      [2]
    );
    assert.match(errors[0].message, /^A quote opened in this row is never closed/);
  });

  test("a missing required column fails the whole paste with a clear message", () => {
    const { drafts, errors, headerProblem } = importQuestionsFromCsv("subject,question,answer\nmath,1+1,2");
    assert.deepEqual(drafts, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /^Missing column\(s\): topic\. /);
    assert.equal(headerProblem, true);
  });

  test("missing columns are named as the sheet names them, not by internal field names", () => {
    const { errors } = importQuestionsFromCsv("subj,question,answer\nmath,1+1,2");
    assert.equal(
      errors[0].message,
      "Missing column(s): subject, topic. The header row needs at least subject, topic, question and correct_answer."
    );
  });

  test("bad rows are reported by spreadsheet row number while good rows still import", () => {
    // With the type column blank, the importer infers it from the options, so
    // the one-option row says multiple choice outright.
    const csv = [
      `${header},type`,
      "math,algebra,Good one,1,2,,,A,",
      "math,algebra,,1,2,,,A,",
      ",algebra,No subject,1,2,,,A,",
      "math,,No topic,1,2,,,A,",
      "math,algebra,One option,1,,,,A,multiple-choice",
      "math,algebra,Wrong answer,1,2,,,Z,"
    ].join("\n");

    const { drafts, errors } = importQuestionsFromCsv(csv);

    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].prompt, "Good one");
    assert.deepEqual(errors, [
      { row: 3, message: "Question text is empty." },
      { row: 4, message: "Subject is empty." },
      { row: 5, message: "Topic is empty." },
      { row: 6, message: "Multiple choice needs at least two options in option_a / option_b." },
      { row: 7, message: 'Correct answer "Z" does not match any of the options.' }
    ]);
  });

  test("a row with two options that read the same is reported, not saved with both marked right", () => {
    const csv = [header, "math,algebra,Pick one,same,same ,other,,B", "math,algebra,Case counts,x,X,,,B"].join("\n");

    const { drafts, errors } = importQuestionsFromCsv(csv);

    assert.deepEqual(errors, [{ row: 2, message: 'Two options are the same ("same"). Each option has to be different.' }]);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].prompt, "Case counts");
  });

  test("rejects a difficulty that is not easy, medium or hard", () => {
    const { errors } = importQuestionsFromCsv("subject,topic,question,answer,difficulty\nmath,algebra,Q,1,tricky");
    assert.match(errors[0].message, /Difficulty "tricky"/);
  });

  test("rejects marks and years that are not whole numbers in range, rather than rounding them", () => {
    const csv = [
      "subject,topic,question,answer,marks,year",
      "math,algebra,Q1,1,2.5,",
      "math,algebra,Q2,1,3 marks,",
      "math,algebra,Q3,1,0,",
      "math,algebra,Q4,1,101,",
      "math,algebra,Q5,1,,2024.5",
      "math,algebra,Q6,1,,20 24",
      "math,algebra,Q7,1,,1899"
    ].join("\n");

    const { drafts, errors } = importQuestionsFromCsv(csv);

    assert.deepEqual(drafts, []);
    assert.deepEqual(
      errors.map((error) => error.row),
      [2, 3, 4, 5, 6, 7, 8]
    );
    assert.match(errors[0].message, /^Marks "2.5"/);
    assert.match(errors[4].message, /^Paper year "2024.5"/);
  });

  test("rejects hex and exponent numbers, which Number() would read as something else", () => {
    const csv = [
      "subject,topic,question,answer,marks,year",
      "math,algebra,Q1,1,0x10,",
      "math,algebra,Q2,1,1e1,",
      "math,algebra,Q3,1,,2.024e3",
      "math,algebra,Q4,1,+2,",
      "math,algebra,Q5,1,4,2024"
    ].join("\n");

    const { drafts, errors } = importQuestionsFromCsv(csv);

    assert.deepEqual(
      errors.map((error) => error.row),
      [2, 3, 4, 5]
    );
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].marks, 4);
    assert.equal(drafts[0].paperYear, 2024);
  });
});

describe("importQuestionsFromCsv row numbers", () => {
  test("a row after a blank one is reported by its spreadsheet row", () => {
    // Row 3 is blank in the sheet: an empty line here, a row of commas below.
    const lines = ["subject,topic,question,correct_answer", "math,algebra,Fine,1", "", "math,algebra,,1"];
    assert.deepEqual(importQuestionsFromCsv(lines.join("\n")).errors, [{ row: 4, message: "Question text is empty." }]);
    lines[2] = ",,,";
    assert.deepEqual(importQuestionsFromCsv(lines.join("\r\n")).errors, [{ row: 4, message: "Question text is empty." }]);
  });

  test("a quoted cell over two lines is still one row", () => {
    const csv = ["subject,topic,question,correct_answer", 'math,algebra,"Two\nlines",1', "math,algebra,,1"].join("\n");
    assert.deepEqual(importQuestionsFromCsv(csv).errors, [{ row: 3, message: "Question text is empty." }]);
  });

  test("blank rows above the header count, and do not hide a tab-separated header", () => {
    const tsv = "\n\nsubject\ttopic\tquestion\tcorrect_answer\nmath\talgebra\t\t1";
    assert.deepEqual(importQuestionsFromCsv(tsv).errors, [{ row: 4, message: "Question text is empty." }]);
  });

  test("an unclosed quote below a blank row names its real row", () => {
    const csv = ["subject,topic,question,correct_answer", "math,algebra,Fine,1", ",,,", 'math,algebra,"never closed,1'].join("\n");
    assert.equal(importQuestionsFromCsv(csv).errors[0].row, 4);
  });
});

describe("a letter answer that is also an option's text", () => {
  const sheet = "subject,topic,question,option_a,option_b,option_c,correct_answer";

  test("a bare letter that could be either is refused, in either case", () => {
    const { drafts, errors } = importQuestionsFromCsv(
      [sheet, "english,grammar,She is ___ engineer.,the,an,a,a", "english,grammar,Pick,the,an,a,A"].join("\n")
    );

    assert.deepEqual(drafts, []);
    assert.deepEqual(
      errors.map((error) => error.row),
      [2, 3]
    );
    assert.match(errors[0].message, /could be option A or the option that reads "a"/);
    assert.match(errors[0].message, /"\(A\)"/);
  });

  test("a letter in brackets is only ever a letter", () => {
    const { drafts, errors } = importQuestionsFromCsv(
      [sheet, "english,grammar,She is ___ engineer.,the,an,a,(B)", "english,grammar,Pick,the,an,a,(C)"].join("\n")
    );

    assert.deepEqual(errors, []);
    assert.deepEqual(
      drafts.map((draft) => draft.correctAnswer),
      ["an", "a"]
    );
  });

  test("a letter whose own column reads the same letter is not ambiguous", () => {
    const { drafts, errors } = importQuestionsFromCsv([sheet, "english,grammar,Pick,a,b,c,a"].join("\n"));

    assert.deepEqual(errors, []);
    assert.equal(drafts[0].correctAnswer, "a");
  });
});

describe("a tab-separated sheet", () => {
  test("is read the same way, with tabs where the commas would be", () => {
    const rows = parseCsv("subject\ttopic\tquestion\nmath\talgebra\tSolve 2x, then check\n");
    assert.deepEqual(rows, [
      ["subject", "topic", "question"],
      ["math", "algebra", "Solve 2x, then check"]
    ]);
  });

  test("imports like the comma version of the same sheet", () => {
    const tabs = ["subject", "topic", "question", "option_a", "option_b", "correct_answer"].join("\t");
    const { drafts, errors } = importQuestionsFromCsv(`${tabs}\nmath\talgebra\tWhat is 1, 2 or 3?\t1\t2\tB`);

    assert.deepEqual(errors, []);
    assert.equal(drafts[0].prompt, "What is 1, 2 or 3?");
    assert.equal(drafts[0].correctAnswer, "2");
  });

  test("a comma-separated header stays comma-separated even if a cell has a tab", () => {
    const { drafts } = importQuestionsFromCsv("subject,topic,question,answer\nmath,algebra,A\tB,1");
    assert.equal(drafts[0].prompt, "A\tB");
  });
});

describe("a semicolon-separated sheet", () => {
  // As Excel saves a CSV wherever the comma is the decimal mark, Azerbaijani
  // and Russian Windows among them.
  const header = ["subject", "topic", "question", "option_a", "option_b", "option_c", "correct_answer", "explanation"].join(";");

  test("is read the same way, with semicolons where the commas would be", () => {
    const rows = parseCsv(`${header}\nmath;algebra;"Solve x; then y";"1,5";2,5;3;A;"Add, then check"\n`);
    assert.deepEqual(rows, [
      ["subject", "topic", "question", "option_a", "option_b", "option_c", "correct_answer", "explanation"],
      ["math", "algebra", "Solve x; then y", "1,5", "2,5", "3", "A", "Add, then check"]
    ]);
  });

  test("imports like the comma version of the same sheet", () => {
    // Excel's CSV UTF-8: a byte order mark and CRLF line endings.
    const csv = [
      header,
      'math;algebra;"Solve x; then y";"1,5";2,5;3;B;"Add, then check"',
      "math;algebra;What is 1,5 + 1?;2,5;3;3,5;A;"
    ].join("\r\n");
    const { drafts, errors } = importQuestionsFromCsv(`﻿${csv}\r\n`);

    assert.deepEqual(errors, []);
    assert.deepEqual(
      drafts.map((draft) => [draft.prompt, draft.options, draft.correctAnswer, draft.explanation]),
      [
        ["Solve x; then y", ["1,5", "2,5", "3"], "2,5", "Add, then check"],
        ["What is 1,5 + 1?", ["2,5", "3", "3,5"], "2,5", ""]
      ]
    );
  });

  test("semicolons in the question text of a comma-separated sheet change nothing", () => {
    const csv = [
      "subject,topic,question,option_a,option_b,correct_answer",
      'math,algebra,"Solve x; then y; then z",1;2,3,A',
      "math,algebra,Pick one; or the other,yes,no,B"
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);

    assert.deepEqual(errors, []);
    assert.deepEqual(
      drafts.map((draft) => [draft.prompt, draft.options]),
      [
        ["Solve x; then y; then z", ["1;2", "3"]],
        ["Pick one; or the other", ["yes", "no"]]
      ]
    );
  });

  test("a comma-separated header with semicolons in its cells stays comma-separated", () => {
    // Split by its semicolons, the last cell reads "paper", which is a name for
    // source: the known names in the comma reading still outnumber it.
    const { drafts, errors } = importQuestionsFromCsv(
      'subject,topic,question,correct_answer,"notes; for me",source; paper\nmath,algebra,1 + 1,2,ok,DİM; 2024'
    );
    assert.deepEqual(errors, []);
    assert.equal(drafts[0].prompt, "1 + 1");
    assert.equal(drafts[0].correctAnswer, "2");
  });

  test("a header line far longer than any real one is decided by its start", () => {
    const { drafts, errors } = importQuestionsFromCsv(`subject;topic;question;correct_answer;${"notes ".repeat(5000)}\nmath;algebra;1 + 1;2;`);
    assert.deepEqual(errors, []);
    assert.equal(drafts[0].prompt, "1 + 1");
  });

  test("a header of names this import does not know is still split by its semicolons", () => {
    assert.deepEqual(parseCsv("Fənn;Mövzu;Sual\nRiyaziyyat;Cəbr;1 + 1"), [
      ["Fənn", "Mövzu", "Sual"],
      ["Riyaziyyat", "Cəbr", "1 + 1"]
    ]);
  });
});

describe("translation columns", () => {
  const translatedHeader = [
    "subject",
    "topic",
    "question",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "correct_answer",
    "explanation",
    "question_ru",
    "option_a_ru",
    "option_b_ru",
    "option_c_ru",
    "option_d_ru",
    "explanation_ru"
  ].join(",");

  test("a Russian version of a maths question is stored beside the English one", () => {
    const row = "math,geometry,Find the radius.,8 cm,16 cm,32 cm,64 cm,B,r = 16,Найдите радиус.,8 см,16 см,32 см,64 см,r = 16";
    const { drafts, errors } = importQuestionsFromCsv(`${translatedHeader}\n${row}`);

    assert.deepEqual(errors, []);
    assert.equal(drafts[0].prompt, "Find the radius.");
    assert.deepEqual(drafts[0].options, ["8 cm", "16 cm", "32 cm", "64 cm"]);
    assert.equal(drafts[0].correctAnswer, "16 cm");
    assert.deepEqual(drafts[0].translations, {
      ru: {
        prompt: "Найдите радиус.",
        options: ["8 см", "16 см", "32 см", "64 см"],
        explanation: "r = 16"
      }
    });
  });

  test("a row with nothing in the translation columns has no translations", () => {
    const row = "math,geometry,Find the radius.,8 cm,16 cm,,,B,,,,,,,";
    const { drafts, errors } = importQuestionsFromCsv(`${translatedHeader}\n${row}`);

    assert.deepEqual(errors, []);
    assert.deepEqual(drafts[0].translations, {});
  });

  test("a translation may leave the options out and use the question's own", () => {
    const row = "math,geometry,Find the radius.,8 cm,16 cm,,,B,,Найдите радиус.,,,,,";
    const { drafts, errors } = importQuestionsFromCsv(`${translatedHeader}\n${row}`);

    assert.deepEqual(errors, []);
    assert.deepEqual(drafts[0].translations, { ru: { prompt: "Найдите радиус." } });
  });

  test("a short answer takes its translated wording from correct_answer_ru", () => {
    const csv = [
      "subject,topic,question,correct_answer,question_ru,correct_answer_ru",
      "math,geometry,Perimeter?,26 cm,Периметр?,26 см"
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);

    assert.deepEqual(errors, []);
    assert.deepEqual(drafts[0].translations, { ru: { prompt: "Периметр?", correctAnswer: "26 см" } });
  });

  test("a translated answer column on a multiple choice row is ignored, not an error", () => {
    // Sheets often repeat the letter in the Russian copy of the answer column.
    const csv = [
      "subject,topic,question,option_a,option_b,correct_answer,question_ru,option_a_ru,option_b_ru,correct_answer_ru",
      "math,algebra,Pick,1,2,B,Выберите,1,2,B"
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);

    assert.deepEqual(errors, []);
    assert.deepEqual(drafts[0].translations, { ru: { prompt: "Выберите", options: ["1", "2"] } });
  });

  test("options that do not line up with the question's are reported against their row", () => {
    const row = "math,geometry,Find the radius.,8 cm,16 cm,32 cm,64 cm,B,,Найдите радиус.,8 см,16 см,,";
    const { drafts, errors } = importQuestionsFromCsv(`${translatedHeader}\n${row}`);

    assert.deepEqual(drafts, []);
    assert.equal(errors[0].row, 2);
    assert.match(errors[0].message, /Russian translation has 2 options but the question has 4/);
  });

  test("a translation with options but no question text is reported", () => {
    const row = "math,geometry,Find the radius.,8 cm,16 cm,,,B,,,8 см,16 см,,,";
    const { drafts, errors } = importQuestionsFromCsv(`${translatedHeader}\n${row}`);

    assert.deepEqual(drafts, []);
    assert.match(errors[0].message, /Russian translation has no question text/);
  });

  test("an English or Russian question cannot be given a translation", () => {
    const row = "english,grammar,Pick one,a,b,,,A,,Выберите,,,,,";
    const { drafts, errors } = importQuestionsFromCsv(`${translatedHeader}\n${row}`);

    assert.deepEqual(drafts, []);
    assert.match(errors[0].message, /English questions are always shown in one language/);
  });

  test("a bad translation skips its row and the rest still import", () => {
    const csv = [
      translatedHeader,
      "math,geometry,Bad,8 cm,16 cm,,,B,,Плохо,только один,,,,",
      "math,geometry,Good,8 cm,16 cm,,,B,,Хорошо,8 см,16 см,,,"
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);

    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].prompt, "Good");
    assert.equal(errors.length, 1);
  });

  test("English can be given as a translation too, under any of the usual header spellings", () => {
    const csv = [
      "subject,topic,question,answer,Question (English),explanation_english,Question (Russian)",
      "math,algebra,Реши 1 + 1,2,Solve 1 + 1,Add them,Реши 1 + 1"
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);

    assert.deepEqual(errors, []);
    assert.deepEqual(drafts[0].translations, {
      en: { prompt: "Solve 1 + 1", explanation: "Add them" },
      ru: { prompt: "Реши 1 + 1" }
    });
  });

  test("a sheet with only Question (English) and Question (Russian) uses the English as the question", () => {
    // The shape of the maths sheet: no plain question column at all.
    const csv = [
      "Subject,Topic,Question (English),Question (Russian),Option A (English),Option B (English),Option A (Russian),Option B (Russian),Correct",
      "math,algebra,Pick one,Выберите,Yes,No,Да,Нет,A"
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);

    assert.deepEqual(errors, []);
    assert.equal(drafts[0].prompt, "Pick one");
    assert.deepEqual(drafts[0].options, ["Yes", "No"]);
    assert.equal(drafts[0].correctAnswer, "Yes");
    // English is the question itself, so it is not stored a second time.
    assert.deepEqual(drafts[0].translations, {
      ru: { prompt: "Выберите", options: ["Да", "Нет"] }
    });
  });
});

describe("five options (DIM papers run A to E)", () => {
  const header = "subject,topic,question,option_a,option_b,option_c,option_d,option_e,correct_answer";

  test("a row answered E keeps all five options", () => {
    const { drafts, errors } = importQuestionsFromCsv([header, "math,algebra,Pick,1,2,3,4,5,E"].join("\n"));
    assert.deepEqual(errors, []);
    assert.deepEqual(drafts[0].options, ["1", "2", "3", "4", "5"]);
    assert.equal(drafts[0].correctAnswer, "5");
  });

  test("a lowercase e and option E's own text both name option E", () => {
    const csv = [header, "math,algebra,Pick,1,2,3,4,five,e", "math,algebra,Pick,1,2,3,4,five,five"].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);
    assert.deepEqual(errors, []);
    assert.deepEqual(drafts.map((draft) => draft.correctAnswer), ["five", "five"]);
  });

  test("a row answered A no longer drops option E", () => {
    const { drafts } = importQuestionsFromCsv([header, "math,algebra,Pick,1,2,3,4,5,A"].join("\n"));
    assert.deepEqual(drafts[0].options, ["1", "2", "3", "4", "5"]);
    assert.equal(drafts[0].correctAnswer, "1");
  });

  test("a tab-separated sheet reads option E the same way", () => {
    const tsv = [header, "math,algebra,Pick,1,2,3,4,5,E"].join("\n").replaceAll(",", "\t");
    const { drafts, errors } = importQuestionsFromCsv(tsv);
    assert.deepEqual(errors, []);
    assert.deepEqual(drafts[0].options, ["1", "2", "3", "4", "5"]);
    assert.equal(drafts[0].correctAnswer, "5");
  });

  test("option_e_ru is the translation of option E", () => {
    const csv = [
      `${header},question_ru,option_a_ru,option_b_ru,option_c_ru,option_d_ru,option_e_ru`,
      "math,algebra,Pick,a,b,c,d,e,E,Выберите,а,б,в,г,д"
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);
    assert.deepEqual(errors, []);
    assert.equal(drafts[0].correctAnswer, "e");
    assert.deepEqual(drafts[0].translations.ru?.options, ["а", "б", "в", "г", "д"]);
  });

  test("a translation with four options for five is refused", () => {
    const csv = [
      `${header},question_ru,option_a_ru,option_b_ru,option_c_ru,option_d_ru`,
      "math,algebra,Pick,a,b,c,d,e,E,Выберите,а,б,в,г"
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);
    assert.equal(drafts.length, 0);
    assert.equal(errors.length, 1);
  });

  test("a four-option sheet is unchanged, and E is not an answer there", () => {
    const csv = [
      "subject,topic,question,option_a,option_b,option_c,option_d,correct_answer",
      "math,algebra,Pick,1,2,3,4,D",
      "math,algebra,Pick,1,2,3,4,E"
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);
    assert.equal(drafts.length, 1);
    assert.deepEqual(drafts[0].options, ["1", "2", "3", "4"]);
    assert.equal(drafts[0].correctAnswer, "4");
    assert.equal(errors[0].row, 3);
  });
});

describe("image_url", () => {
  const sheet = "subject,topic,question,correct_answer,image_url";

  test("a file name, a script or a link that is not https skips its row, naming the value", () => {
    const csv = [
      sheet,
      "math,geometry,Q1,4,diagram1.png",
      "english,reading,Q2,1 mark,picture 3.jpg",
      "math,geometry,Q3,4,javascript:alert(1)",
      "math,geometry,Q4,4,http://127.0.0.1:54775/internal-only",
      "math,geometry,Q5,4,https://example.com/q5.png",
      "math,geometry,Q6,4,"
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);

    assert.deepEqual(
      errors.map((error) => error.row),
      [2, 3, 4, 5]
    );
    assert.equal(
      errors[0].message,
      'image_url "diagram1.png" is not a full link starting with https://. Put the picture\'s full link there, or leave image_url empty and add the picture in the admin form.'
    );
    assert.deepEqual(
      drafts.map((draft) => [draft.prompt, draft.imageUrl]),
      [
        ["Q5", "https://example.com/q5.png"],
        ["Q6", null]
      ]
    );
  });

  test("links into the project's storage, and pictures kept inline without storage, follow the rules given", () => {
    const rules = { supabaseOrigin: "http://127.0.0.1:54321", allowInlinePictures: true };
    const csv = [
      sheet,
      "math,geometry,Q1,4,http://127.0.0.1:54321/storage/v1/object/public/question-images/a.png",
      'math,geometry,Q2,4,"data:image/png;base64,iVBORw0KGgo="',
      "math,geometry,Q3,4,http://127.0.0.1:9999/a.png"
    ].join("\n");

    const memory = importQuestionsFromCsv(csv, { pictureLinks: rules });
    assert.deepEqual(
      memory.drafts.map((draft) => draft.prompt),
      ["Q1", "Q2"]
    );
    assert.deepEqual(
      memory.errors.map((error) => error.row),
      [4]
    );

    const withStorage = importQuestionsFromCsv(csv, { pictureLinks: { ...rules, allowInlinePictures: false } });
    assert.deepEqual(
      withStorage.errors.map((error) => error.row),
      [3, 4]
    );
    assert.match(withStorage.errors[0].message, /^image_url holds a picture itself \(a data: link\)/);
  });

  test("a link is imported written out in full, as it is read, not as it was typed", () => {
    const csv = [
      sheet,
      "math,geometry,Q1,4,https:example.com/q1.png",
      "math,geometry,Q2,4,HTTPS://EXAMPLE.COM/q2.png",
      "math,geometry,Q3,4,https:\\\\example.com\\q3.png",
      "math,geometry,Q4,4,https://example.com/picture 4.png",
      "math,geometry,Q5,4,http:127.0.0.1:54321/storage/v1/object/public/question-images/q5.png"
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv, {
      pictureLinks: { supabaseOrigin: "http://127.0.0.1:54321", allowInlinePictures: false }
    });

    assert.deepEqual(errors, []);
    assert.deepEqual(
      drafts.map((draft) => draft.imageUrl),
      [
        "https://example.com/q1.png",
        "https://example.com/q2.png",
        "https://example.com/q3.png",
        "https://example.com/picture%204.png",
        "http://127.0.0.1:54321/storage/v1/object/public/question-images/q5.png"
      ]
    );
  });

  test("a very long value is cut short in the message", () => {
    const { errors } = importQuestionsFromCsv(`${sheet}\nmath,geometry,Q1,4,${"x".repeat(500)}.png`);
    assert.ok(errors[0].message.length < 250, errors[0].message);
  });
});

describe("importQuestionsFromCsv topic length", () => {
  test("a topic longer than a test can ask for is reported, not saved", () => {
    const long = "a".repeat(101);
    const csv = ["subject,topic,question,correct_answer", `math,${long},1 + 1,2`, `math,${"a".repeat(100)},2 + 2,4`].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);

    assert.deepEqual(
      errors.map((error) => error.row),
      [2]
    );
    assert.equal(drafts.length, 1);
  });
});

describe("subjects and topics are the site's own", () => {
  const header = "subject,topic,question,option_a,option_b,correct_answer";
  const rowFor = (subject: string, topic = "algebra") => `${subject},${topic},Pick,x,y,A`;

  test("every alias resolves to its subject, whatever the case", () => {
    const expected: Record<string, string> = {
      math: "math",
      Mathematics: "math",
      Maths: "math",
      MATHS: "math",
      "Математика": "math",
      Riyaziyyat: "math",
      english: "english",
      English: "english",
      "English Language": "english",
      "Английский язык": "english",
      "İngilis dili": "english",
      russian: "russian",
      Russian: "russian",
      "Russian Language": "russian",
      "Русский язык": "russian",
      "Rus dili": "russian",
      azerbaijani: "azerbaijani",
      "Azerbaijani Language": "azerbaijani",
      "Azərbaycan dili": "azerbaijani",
      "Азербайджанский язык": "azerbaijani"
    };
    for (const [typed, id] of Object.entries(expected)) {
      const { drafts, errors } = importQuestionsFromCsv([header, rowFor(typed, "grammar")].join("\n"));
      assert.deepEqual(errors, [], typed);
      assert.equal(drafts[0].subjectId, id, typed);
    }
  });

  test("an unknown subject is that row's error and the other rows still import", () => {
    const csv = [header, rowFor("math"), rowFor("physics"), rowFor("Maths")].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);
    assert.equal(drafts.length, 2);
    assert.deepEqual(drafts.map((draft) => draft.subjectId), ["math", "math"]);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].row, 3);
    assert.equal(errors[0].message, 'Subject "physics" is not one of math, english, russian, azerbaijani.');
  });

  test("a topic given by name becomes the known topic's id", () => {
    const csv = [header, rowFor("math", "Functions and Graphs"), rowFor("math", "functions")].join("\n");
    const { drafts } = importQuestionsFromCsv(csv);
    assert.deepEqual(drafts.map((draft) => draft.topicId), ["functions", "functions"]);
  });

  test("an unknown topic is still allowed and slugified as before", () => {
    const { drafts, errors } = importQuestionsFromCsv([header, rowFor("math", "Word Problems")].join("\n"));
    assert.deepEqual(errors, []);
    assert.equal(drafts[0].topicId, "word-problems");
  });
});

describe("quotes inside cells", () => {
  const tsvHeader = header.replaceAll(",", "\t");
  const tsvRow = (...cells: string[]) => cells.join("\t");
  const csvRow = (...cells: string[]) => cells.join(",");

  test("TSV: a quote in the middle of a cell is plain text and later rows survive", () => {
    const tsv = [
      tsvHeader,
      tsvRow("english", "grammar", 'Choose the word in "quotes" here', "a", "b", "c", "d", "A"),
      tsvRow("english", "grammar", "Second", "a", "b", "c", "d", "B"),
      tsvRow("english", "grammar", "Third", "a", "b", "c", "d", "C")
    ].join("\n");
    const rows = parseCsv(tsv);
    assert.equal(rows.length, 4);
    assert.equal(rows[1][2], 'Choose the word in "quotes" here');
    const { drafts, errors } = importQuestionsFromCsv(tsv);
    assert.deepEqual(errors, []);
    assert.equal(drafts.length, 3);
  });

  test("TSV: an inch mark is kept", () => {
    const tsv = [
      tsvHeader,
      tsvRow("english", "grammar", `He is 6' 2" tall`, "yes", "no", "", "", "A"),
      tsvRow("english", "grammar", "Next", "yes", "no", "", "", "B")
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(tsv);
    assert.deepEqual(errors, []);
    assert.equal(drafts.length, 2);
    assert.equal(drafts[0].prompt, `He is 6' 2" tall`);
  });

  test("TSV: a properly quoted multi-line cell is one cell", () => {
    const tsv = [
      tsvHeader,
      tsvRow("english", "grammar", '"line one\nline ""two"""', "a", "b", "c", "d", "A"),
      tsvRow("english", "grammar", "Next", "a", "b", "c", "d", "B")
    ].join("\n");
    const rows = parseCsv(tsv);
    assert.equal(rows.length, 3);
    assert.equal(rows[1][2], 'line one\nline "two"');
  });

  test("TSV: an unterminated quote is an error naming its row, not lost rows", () => {
    const tsv = [
      tsvHeader,
      tsvRow("english", "grammar", "Fine", "a", "b", "c", "d", "A"),
      tsvRow("english", "grammar", '"never closed', "a", "b", "c", "d", "A"),
      tsvRow("english", "grammar", "Swallowed", "a", "b", "c", "d", "B")
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(tsv);
    assert.equal(drafts.length, 1);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].row, 3);
  });

  test("CSV: a quote in the middle of a cell is plain text", () => {
    const csv = [
      header,
      csvRow("english", "grammar", 'Choose the word in "quotes" here', "a", "b", "c", "d", "A"),
      csvRow("english", "grammar", "Second", "a", "b", "c", "d", "B")
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);
    assert.deepEqual(errors, []);
    assert.equal(drafts[0].prompt, 'Choose the word in "quotes" here');
    assert.equal(drafts.length, 2);
  });

  test("CSV: an inch mark is kept", () => {
    const csv = [header, csvRow("english", "grammar", `He is 6' 2" tall`, "yes", "no", "", "", "A")].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);
    assert.deepEqual(errors, []);
    assert.equal(drafts[0].prompt, `He is 6' 2" tall`);
  });

  test("CSV: a quoted multi-line cell with commas and escaped quotes still works", () => {
    const csv = [header, csvRow("english", "grammar", '"one, ""two""\nthree"', "a", "b", "c", "d", "A")].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);
    assert.deepEqual(errors, []);
    assert.equal(drafts[0].prompt, 'one, "two"\nthree');
  });

  test("CSV: an unterminated quote is an error naming its row", () => {
    const csv = [
      header,
      csvRow("english", "grammar", "Fine", "a", "b", "c", "d", "A"),
      csvRow("english", "grammar", '"open', "a", "b", "c", "d", "A"),
      csvRow("english", "grammar", "Gone", "a", "b", "c", "d", "B")
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);
    assert.equal(drafts.length, 1);
    assert.deepEqual(errors.map((e) => e.row), [3]);
  });
});

describe("withoutDuplicates", () => {
  const sheet = [
    header,
    "math,algebra,Solve 2x = 4,1,2,3,4,B",
    "math,algebra,Solve 3x = 9,1,2,3,4,C",
    "math,algebra,  solve   2X = 4 ,1,2,3,4,B"
  ].join("\n");

  test("each draft keeps the spreadsheet row it came from", () => {
    assert.deepEqual(importQuestionsFromCsv(sheet).draftRows, [2, 3, 4]);
  });

  test("a row repeating an earlier one, ignoring capitals and spaces, is left out by row", () => {
    const { drafts, duplicateRows } = withoutDuplicates(importQuestionsFromCsv(sheet), []);
    assert.deepEqual(drafts.map((d) => d.prompt), ["Solve 2x = 4", "Solve 3x = 9"]);
    assert.deepEqual(duplicateRows, [4]);
  });

  test("pasting the same sheet again imports nothing twice", () => {
    const first = withoutDuplicates(importQuestionsFromCsv(sheet), []);
    const again = withoutDuplicates(importQuestionsFromCsv(sheet), first.drafts);
    assert.deepEqual(again.drafts, []);
    assert.deepEqual(again.duplicateRows, [2, 3, 4]);
  });

  test("the same text under another topic or with other options is a different question", () => {
    const bank = importQuestionsFromCsv(sheet).drafts;
    const other = importQuestionsFromCsv(
      [header, "math,geometry,Solve 2x = 4,1,2,3,4,B", "math,algebra,Solve 2x = 4,1,2,3,5,B"].join("\n")
    );
    assert.equal(withoutDuplicates(other, bank).drafts.length, 2);
  });
});

/**
 * Nihad's own workbook: the header below is the one his Questions sheet has,
 * and the rows are shaped like real ones (shortened) from it.
 */
const workbookColumns = [
  "Q#",
  "Subject",
  "Topic",
  "Subtopic",
  "Question (original AZ)",
  "Difficulty",
  "Answer Options (full)",
  "Correct Answer (DİM)",
  "Image / Page",
  "Date",
  "Status",
  "Source",
  "Sector",
  "Variant",
  "Official DİM Key",
  "Key Check",
  "Passage ID",
  "Passage Title",
  "Passage (separate column)",
  "A",
  "B",
  "C",
  "D",
  "E",
  "Notes / exactness",
  "Official source URL"
];

function workbookSheet(...rows: Array<Record<string, string>>): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [workbookColumns, ...rows.map((row) => workbookColumns.map((column) => row[column] ?? ""))]
    .map((cells) => cells.map(quote).join(","))
    .join("\n");
}

const azGrammar = {
  "Q#": "27.0",
  Subject: "Azərbaycan dili",
  Topic: "Azərbaycan dili / Qrammatika",
  Subtopic: "Выбор варианта",
  "Question (original AZ)": "Nümunənin təhlilinə əsasən cədvəldəki uyğunluğu müəyyən edin.",
  "Correct Answer (DİM)": "C",
  Date: "05.04.2026",
  Source: "Фото пользователя",
  Sector: "AZ",
  Variant: "C",
  A: "2,3,5,6",
  B: "1,3,4",
  C: "1,3,5,6",
  D: "1,2,4,5",
  E: "2,4,6"
};

const mathLettered = {
  "Q#": "59.0",
  Subject: "Riyaziyyat",
  Topic: "Riyaziyyat",
  "Question (original AZ)": "(3y − 2)/4 − (3 − y)/5 + 3 = 0 tənliyini həll edin.",
  Difficulty: "2.0",
  "Answer Options (full)": "A) −2\nB) 3\nC) 1\nD) −3\nE) 2",
  "Correct Answer (DİM)": "A",
  Date: "26.04.2026",
  Sector: "AZ",
  Variant: "C"
};

const readingOnPassage = {
  "Q#": "43.0",
  Subject: "Azərbaycan dili",
  Topic: "Oxu / Mətn",
  "Question (original AZ)": "Mətnə görə əsaslandırılması mümkün olan fikri seçin.",
  "Answer Options (full)": "1. Əvvəlki dövrlərdə əhalisiz torpaq bölgələri var idi.",
  "Correct Answer (DİM)": "D",
  Date: "12.04.2026",
  Sector: "AZ",
  Variant: "B",
  "Passage ID": "12-P1",
  "Passage Title": "“İlanlı”nın dərdi",
  "Passage (separate column)": "Aslan torpağı suya həsrət qalan, qara yelin yandırdığı bir yurd.",
  A: "1,2,4",
  B: "1,3,4",
  C: "3,4,5",
  D: "1,2,5",
  E: "2,3,5"
};

describe("importing Nihad's workbook", () => {
  test("maps his columns without renaming them: topic, subtopic, difficulty, date, source and key", () => {
    const { drafts, rows, errors } = importQuestionsFromCsv(workbookSheet(azGrammar, mathLettered));

    assert.deepEqual(errors, []);
    assert.equal(drafts[0].subjectId, "azerbaijani");
    assert.equal(drafts[0].topicId, "grammar");
    assert.equal(drafts[0].difficulty, "medium");
    assert.equal(drafts[0].correctAnswer, "1,3,5,6");
    assert.equal(drafts[0].paperYear, 2026);
    assert.equal(drafts[0].source, "DİM 05.04.2026, AZ sector, Variant C, Q27");
    assert.equal(rows[0].externalRef, "dim-2026-04-05-az-c:q27");
    assert.equal(rows[0].subtopic, "Выбор варианта");
    assert.equal(rows[0].status, "ready");

    // "2.0" is how Excel writes a typed 2.
    assert.equal(drafts[1].difficulty, "medium");
    assert.equal(rows[1].externalRef, "dim-2026-04-26-az-c:q59");
  });

  test("reads the options from Answer Options (full) when the A to E columns are empty", () => {
    const { drafts, errors } = importQuestionsFromCsv(workbookSheet(mathLettered));

    assert.deepEqual(errors, []);
    assert.equal(drafts[0].type, "multiple-choice");
    assert.deepEqual(drafts[0].options, ["−2", "3", "1", "−3", "2"]);
    assert.equal(drafts[0].correctAnswer, "−2");
    // His topic is just the subject's own name: one general topic, not a crash.
    assert.equal(drafts[0].topicId, "general");
  });

  test("difficulty 1, 2 and 3 (also written 1.0) are easy, medium and hard", () => {
    const sheet = ["subject,topic,question,answer,difficulty", "english,grammar,a?,x,1.0", "english,grammar,b?,x,2", "english,grammar,c?,x,3", "english,grammar,d?,x,"].join("\n");
    assert.deepEqual(
      importQuestionsFromCsv(sheet).drafts.map((draft) => draft.difficulty),
      ["easy", "medium", "hard", "medium"]
    );
  });

  test("topic names in Azerbaijani, Russian and English map to the starter topics", () => {
    const topics = (subject: string, ...names: string[]) =>
      importQuestionsFromCsv(
        ["subject,topic,question,answer", ...names.map((name, index) => `${subject},"${name}",q${index}?,x`)].join("\n")
      ).drafts.map((draft) => draft.topicId);

    assert.deepEqual(
      topics("Azərbaycan dili", "Leksika", "Orfoqrafiya", "Durğu işarələri", "Fonetika", "Yazı", "Mətn", "Azərbaycan dili / Oxu"),
      ["vocabulary", "spelling", "punctuation", "phonetics", "writing", "reading", "reading"]
    );
    assert.deepEqual(topics("math", "Sets & Logic", "Probability", "Вероятность", "Algebra"), [
      "sets-logic",
      "probability",
      "probability",
      "algebra"
    ]);
  });

  test("a written answer without a published key is a draft only when drafts are kept", () => {
    const row = {
      ...azGrammar,
      "Q#": "45.0",
      Topic: "Oxu / Mətn",
      Subtopic: "Открытый ответ",
      "Answer Options (full)": "Yazılı açıq cavab.",
      "Correct Answer (DİM)": "Не опубликован в кратком ключе",
      A: "",
      B: "",
      C: "",
      D: "",
      E: ""
    };

    const strict = importQuestionsFromCsv(workbookSheet(row));
    assert.deepEqual(strict.drafts, []);
    assert.equal(strict.errors.length, 1);

    const kept = importQuestionsFromCsv(workbookSheet(row), { keepDrafts: true });
    assert.deepEqual(kept.errors, []);
    assert.equal(kept.drafts[0].type, "open-ended");
    assert.equal(kept.rows[0].status, "draft");
    assert.match(kept.rows[0].reason ?? "", /marking guide/);
  });

  test("short answers: a number is a ready answer, an unpublished key is a draft", () => {
    const short = {
      Subject: "Riyaziyyat",
      Topic: "Algebra",
      "Question (original AZ)": "Bərabərsizliyin həllərinin sayını tapın.",
      "Answer Options (full)": "No answer choices — short-answer response.",
      Date: "12.04.2026",
      Sector: "AZ",
      Variant: "B"
    };
    const { drafts, rows, errors } = importQuestionsFromCsv(
      workbookSheet(
        { ...short, "Q#": "73.0", "Correct Answer (DİM)": "14" },
        { ...short, "Q#": "78.0", "Correct Answer (DİM)": "Не опубликован в кратком ключе" }
      ),
      { keepDrafts: true }
    );

    assert.deepEqual(errors, []);
    assert.equal(drafts[0].type, "short-answer");
    assert.equal(drafts[0].correctAnswer, "14");
    assert.equal(rows[0].status, "ready");
    assert.equal(rows[1].status, "draft");
    assert.match(rows[1].reason ?? "", /key not published/);
  });

  test("a key Excel turned from 1,4 into 1.4 is a draft that says so, not a guess", () => {
    const row = {
      "Q#": "12.0",
      Subject: "İngilis dili",
      Topic: "Reading",
      "Question (original AZ)": "Based on the passage about Komodo dragons, match the sentences.",
      "Answer Options (full)": "1) Komodo National Park was created at t\n2) another",
      "Correct Answer (DİM)": "1.4",
      Date: "12.04.2026",
      Sector: "AZ",
      Variant: "B"
    };

    const { rows, errors } = importQuestionsFromCsv(workbookSheet(row), { keepDrafts: true });
    assert.deepEqual(errors, []);
    assert.equal(rows[0].status, "draft");
    assert.match(rows[0].reason ?? "", /Excel turned the answer 1,4 into 1\.4; check the key/);
  });

  test("a key letter pointing at an empty option is a draft, and an error when drafts are not kept", () => {
    const row = { ...azGrammar, E: "", "Correct Answer (DİM)": "E" };
    assert.equal(importQuestionsFromCsv(workbookSheet(row)).errors.length, 1);

    const kept = importQuestionsFromCsv(workbookSheet(row), { keepDrafts: true });
    assert.equal(kept.rows[0].status, "draft");
    assert.match(kept.rows[0].reason ?? "", /option E is empty/);
    assert.equal(kept.drafts[0].correctAnswer, "");
  });

  test("a choice question with no options yet is a draft", () => {
    const row = { ...azGrammar, A: "", B: "", C: "", D: "", E: "" };
    const kept = importQuestionsFromCsv(workbookSheet(row), { keepDrafts: true });
    assert.equal(kept.drafts[0].type, "short-answer");
    const typed = importQuestionsFromCsv(workbookSheet({ ...row, "Answer Options (full)": "1) as 2) if" }), { keepDrafts: true });
    assert.equal(typed.drafts[0].type, "multiple-choice");
    assert.match(typed.rows[0].reason ?? "", /no options yet/);
  });

  test("a question with no subject, topic or text is still an error with drafts kept", () => {
    const { drafts, errors } = importQuestionsFromCsv(
      workbookSheet({ ...azGrammar, Subject: "" }, { ...azGrammar, Topic: "" }, { ...azGrammar, "Question (original AZ)": "" }),
      { keepDrafts: true }
    );
    assert.deepEqual(drafts, []);
    assert.deepEqual(errors.map((error) => error.message), ["Subject is empty.", "Topic is empty.", "Question text is empty."]);
  });

  test("without date, sector, variant and Q# the old source column and no key are used", () => {
    const { drafts, rows } = importQuestionsFromCsv("subject,topic,question,answer,source,year\nenglish,grammar,a?,x,Mock 3,2024");
    assert.equal(drafts[0].source, "Mock 3");
    assert.equal(drafts[0].paperYear, 2024);
    assert.equal(rows[0].externalRef, null);
  });
});

describe("multiple select in a sheet", () => {
  const sheet = (answer: string, type = "multiple-select") =>
    `subject,topic,question,option_a,option_b,option_c,option_d,correct_answer,type\nmath,algebra,Which are even?,2,3,4,5,"${answer}",${type}`;

  test("A, D then A;D then AD all tick the same two options", () => {
    for (const answer of ["A, D", "A;D", "AD", "a d"]) {
      const { drafts, errors } = importQuestionsFromCsv(sheet(answer));
      assert.deepEqual(errors, [], answer);
      assert.equal(drafts[0].type, "multiple-select");
      assert.deepEqual(decodeAnswerSet(drafts[0].correctAnswer), ["2", "5"]);
    }
  });

  test("the type column accepts multi, select-all and multiple answers", () => {
    for (const type of ["multi", "select-all", "multiple answers", "Multiple Select"]) {
      assert.equal(importQuestionsFromCsv(sheet("A,B", `"${type}"`)).drafts[0]?.type, "multiple-select", type);
    }
  });

  test("a letter with no option behind it is refused, or a draft when kept", () => {
    const text = "subject,topic,question,option_a,option_b,option_c,correct_answer,type\nmath,algebra,Pick,1,2,3,\"A, E\",multi";
    assert.equal(importQuestionsFromCsv(text).errors.length, 1);
    assert.equal(importQuestionsFromCsv(text, { keepDrafts: true }).rows[0].status, "draft");
  });
});

describe("translation columns in Azerbaijani", () => {
  test("question_az and option_a_azerbaijani are read beside _ru and _en for maths", () => {
    const csv = [
      "subject,topic,question,option_a,option_b,correct_answer,question_az,option_a_az,option_b_az,question_ru,option_a_ru,option_b_ru",
      "math,algebra,Solve 2x=4,1,2,B,2x=4 həll edin,1,2,Реши 2x=4,1,2"
    ].join("\n");
    const { drafts, errors } = importQuestionsFromCsv(csv);
    assert.deepEqual(errors, []);
    assert.equal(drafts[0].translations.az?.prompt, "2x=4 həll edin");
    assert.deepEqual(drafts[0].translations.az?.options, ["1", "2"]);
    assert.equal(drafts[0].translations.ru?.prompt, "Реши 2x=4");
  });
});

describe("passages in a sheet", () => {
  const second = { ...readingOnPassage, "Q#": "44.0", "Passage Title": "", "Passage (separate column)": "" };
  const first = { ...readingOnPassage, "Q#": "43.0" };

  test("the first row with text creates the passage; every row on it gets its order", () => {
    // Listed out of order on purpose: the order follows the question number.
    const { passages, rows, errors } = importQuestionsFromCsv(workbookSheet(second, first));

    assert.deepEqual(errors, []);
    assert.equal(passages.length, 1);
    assert.equal(passages[0].externalRef, "12-P1");
    assert.equal(passages[0].draft.title, "“İlanlı”nın dərdi");
    assert.equal(passages[0].draft.subjectId, "azerbaijani");
    assert.equal(passages[0].draft.paperYear, 2026);
    assert.equal(passages[0].draft.source, "DİM 12.04.2026, AZ sector, Variant B");
    assert.deepEqual(rows.map((row) => [row.passageRef, row.passageOrder]), [["12-P1", 2], ["12-P1", 1]]);
  });

  test("planImport links a question to its passage, or makes it a draft when the passage is missing", () => {
    const result = importQuestionsFromCsv(workbookSheet(first, second), { keepDrafts: true });

    const linked = planImport(result, { bank: [], passages: new Map([["12-P1", { id: "passage-1" }]]), keepDrafts: true });
    assert.deepEqual(linked.items.map((item) => [item.draft.passageId, item.draft.passageOrder, item.status]), [
      ["passage-1", 1, "ready"],
      ["passage-1", 2, "ready"]
    ]);

    const missing = planImport(result, { bank: [], passages: new Map(), keepDrafts: true });
    assert.equal(missing.items[0].status, "draft");
    assert.equal(missing.items[0].draft.passageId, null);
    assert.equal(missing.items[0].reason, "passage 12-P1 not in the bank yet; import the Reading texts sheet");

    const strict = planImport(result, { bank: [], passages: new Map(), keepDrafts: false });
    assert.deepEqual(strict.items, []);
    assert.equal(strict.errors.length, 2);
  });

  test("a row with a sheet key is updated, not left out as a duplicate of the bank", () => {
    const result = importQuestionsFromCsv(workbookSheet(azGrammar, azGrammar));
    const bank = result.drafts;
    const plan = planImport(result, { bank, passages: new Map(), keepDrafts: false });
    assert.equal(plan.items.length, 1);
    assert.deepEqual(plan.duplicateRows, [3]);
  });
});

describe("Reading texts sheet", () => {
  const readingTexts = [
    "ID текста,Дата,Вариант,Вопросы,Название,Полный текст / перепечатка,Точность,Фото оригинала",
    "05-P1,05.04.2026,C,37–46,Bir xatirə,Atam müharibəyə getdi. Anamla ikimiz qaldıq.,Частичная,стр. 6",
    "05-P2,05.04.2026,C,47–56,Arxitektura,\"Arxitektura – binaların, digər tikinti obyektlərinin\",Ручная,стр. 7"
  ].join("\n");

  test("is recognised by its header, and the questions sheet is not", () => {
    assert.equal(looksLikePassageSheet(readingTexts), true);
    assert.equal(looksLikePassageSheet("passage_id,title,text\nP1,Title,Body"), true);
    assert.equal(looksLikePassageSheet(workbookSheet(azGrammar)), false);
    assert.equal(looksLikePassageSheet("subject,topic,question,answer\nmath,algebra,q,1"), false);
  });

  test("reads one passage per row, keyed by its id, in Azerbaijani by default", () => {
    const { passages, errors } = importPassagesFromCsv(readingTexts);
    assert.deepEqual(errors, []);
    assert.deepEqual(passages.map((passage) => passage.externalRef), ["05-P1", "05-P2"]);
    assert.equal(passages[0].draft.title, "Bir xatirə");
    assert.equal(passages[0].draft.subjectId, "azerbaijani");
    assert.equal(passages[0].draft.paperYear, 2026);
    assert.equal(passages[0].draft.source, "DİM 05.04.2026, Variant C");
    assert.equal(passages[1].draft.body, "Arxitektura – binaların, digər tikinti obyektlərinin");
  });

  test("reports a row with no text or a repeated id", () => {
    const { passages, errors } = importPassagesFromCsv(
      "passage_id,title,text,subject\nP1,One,,english\nP2,Two,Body,english\nP2,Again,Body,english\nP3,Three,Body,physics"
    );
    assert.deepEqual(passages.map((passage) => passage.externalRef), ["P2"]);
    assert.deepEqual(errors.map((error) => error.row), [2, 4, 5]);
  });
});
