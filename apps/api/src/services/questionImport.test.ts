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
        source: null
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
    assert.match(errors[0].message, /Missing required column\(s\): topicId/);
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
});
