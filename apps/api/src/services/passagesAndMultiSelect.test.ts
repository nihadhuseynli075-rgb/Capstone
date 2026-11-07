import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { BankQuestion } from "@grade9/shared";
import { answerSetsMatch, decodeAnswerSet, encodeAnswerSet, readableAnswer } from "@grade9/shared";
import type { AttemptQuestion } from "../repositories/attemptRepository";
import { withoutRepeats } from "../repositories/questionRepository";
import { isAnswerCorrect } from "./marking";
import { drawingUnits, takeFromUnits } from "./mockTestGenerator";
import { localizeQuestion, translationProblems } from "./questionTranslations";

/** From the session with Nihad, 7 Nov 2026: passages, and more than one right answer. */

function bank(id: string, overrides: Partial<BankQuestion> = {}): BankQuestion {
  return {
    id,
    subjectId: "azerbaijani",
    topicId: "reading",
    difficulty: "medium",
    type: "multiple-choice",
    prompt: `Question ${id}`,
    options: ["a", "b"],
    correctAnswer: "a",
    marks: 1,
    explanation: "",
    imageUrl: null,
    paperYear: 2026,
    source: null,
    status: "ready",
    subtopic: null,
    translations: {},
    passageId: null,
    passageOrder: null,
    createdAt: "2026-11-07T00:00:00.000Z",
    updatedAt: "2026-11-07T00:00:00.000Z",
    ...overrides
  };
}

describe("drawing a paper with passages", () => {
  const questions = [
    bank("s1"),
    bank("p3", { passageId: "P", passageOrder: 3 }),
    bank("s2"),
    bank("p1", { passageId: "P", passageOrder: 1 }),
    bank("p2", { passageId: "P", passageOrder: 2 }),
    bank("s3")
  ];

  test("keeps a passage's questions together and in their order", () => {
    for (let run = 0; run < 20; run += 1) {
      const units = drawingUnits(questions);
      assert.equal(units.length, 4);
      const passage = units.find((unit) => unit.length > 1);
      assert.deepEqual(
        passage?.map((question) => question.id),
        ["p1", "p2", "p3"]
      );
    }
  });

  test("serves exactly the count asked for, cutting a passage short only at the end", () => {
    for (let run = 0; run < 20; run += 1) {
      const picked = takeFromUnits(drawingUnits(questions), 4);
      assert.equal(picked.length, 4);
      const ids = picked.map((question) => question.id);
      const passageIds = ids.filter((id) => id.startsWith("p"));
      // Whatever part of the passage is in, it is its first questions, together.
      assert.deepEqual(passageIds, ["p1", "p2", "p3"].slice(0, passageIds.length));
      if (passageIds.length > 0) {
        const first = ids.indexOf(passageIds[0]);
        assert.deepEqual(ids.slice(first, first + passageIds.length), passageIds);
      }
    }
  });

  test("puts questions with no number after the numbered ones", () => {
    const units = drawingUnits([bank("x", { passageId: "Q" }), bank("y", { passageId: "Q", passageOrder: 1 })]);
    assert.deepEqual(units[0].map((question) => question.id), ["y", "x"]);
  });
});

describe("questions with more than one right answer", () => {
  const options = ["as", "if", "that", "because"];

  test("are stored as the chosen options, in the order printed", () => {
    assert.equal(encodeAnswerSet(options, ["because", "as"]), JSON.stringify(["as", "because"]));
    assert.equal(encodeAnswerSet(options, []), "");
    assert.deepEqual(decodeAnswerSet('["as","because"]'), ["as", "because"]);
    assert.deepEqual(decodeAnswerSet("as"), ["as"]);
    assert.deepEqual(decodeAnswerSet(""), []);
  });

  test("are right only with exactly the right options", () => {
    const correct = encodeAnswerSet(options, ["as", "because"]);
    assert.equal(answerSetsMatch(encodeAnswerSet(options, ["because", "as"]), correct), true);
    assert.equal(answerSetsMatch(encodeAnswerSet(options, ["as"]), correct), false);
    assert.equal(answerSetsMatch(encodeAnswerSet(options, ["as", "because", "if"]), correct), false);
    assert.equal(answerSetsMatch("", correct), false);
  });

  test("are marked that way", () => {
    const question = {
      questionId: "q",
      position: 0,
      subjectId: "english",
      topicId: "grammar",
      difficulty: "medium",
      type: "multiple-select",
      prompt: "I stayed home ___ it was raining.",
      options,
      correctAnswer: encodeAnswerSet(options, ["as", "because"]),
      marks: 1,
      explanation: "",
      imageUrl: null,
      studentAnswer: null,
      isCorrect: null,
      score: null,
      feedback: null
    } as AttemptQuestion;
    assert.equal(isAnswerCorrect(question, encodeAnswerSet(options, ["as", "because"])), true);
    assert.equal(isAnswerCorrect(question, encodeAnswerSet(options, ["as"])), false);
  });

  test("read as a list for people", () => {
    assert.equal(readableAnswer("multiple-select", '["as","because"]'), "as; because");
    assert.equal(readableAnswer("multiple-choice", "as"), "as");
  });

  test("take each right answer from the same place in a translation", () => {
    const question = bank("m", {
      subjectId: "math",
      type: "multiple-select",
      options: ["2", "3", "4"],
      correctAnswer: encodeAnswerSet(["2", "3", "4"], ["2", "4"]),
      translations: { az: { prompt: "Cüt ədədləri seçin", options: ["iki", "üç", "dörd"] } }
    });
    assert.deepEqual(translationProblems(question), []);
    const served = localizeQuestion(question, "az");
    assert.equal(served.prompt, "Cüt ədədləri seçin");
    assert.equal(served.correctAnswer, JSON.stringify(["iki", "dörd"]));
  });
});

describe("the admin list", () => {
  test("lists a question read twice only once", () => {
    const once = bank("a");
    assert.deepEqual(withoutRepeats([once, bank("b"), once]).map((question) => question.id), ["a", "b"]);
  });
});
