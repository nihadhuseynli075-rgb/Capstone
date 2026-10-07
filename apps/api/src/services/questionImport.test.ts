import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { importQuestionsFromCsv, parseCsv, resolveCorrectAnswer } from "./questionImport";

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
        translations: {}
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

  test("a missing required column fails the whole paste with a clear message", () => {
    const { drafts, errors } = importQuestionsFromCsv("subject,question,answer\nmath,1+1,2");
    assert.deepEqual(drafts, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /^Missing column\(s\): topic\. /);
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
      "Rus dili": "russian"
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
    assert.equal(errors[0].message, 'Subject "physics" is not one of math, english, russian.');
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
