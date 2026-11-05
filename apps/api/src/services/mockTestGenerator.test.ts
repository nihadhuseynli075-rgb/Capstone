import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fullMockId, fullMockSector, resolveSettings, subjectName, subjectsCovered } from "@grade9/shared";
import { shareQuestions } from "./mockTestGenerator";

describe("a full mock's share of each subject", () => {
  test("is even when every subject has enough", () => {
    assert.deepEqual(shareQuestions(9, [50, 50, 50]), [3, 3, 3]);
  });

  test("gives what is left after an even split to the first subjects", () => {
    assert.deepEqual(shareQuestions(10, [50, 50, 50]), [4, 3, 3]);
    assert.deepEqual(shareQuestions(50, [50, 50, 50]), [17, 17, 16]);
  });

  test("hands a subject's shortfall to the others", () => {
    assert.deepEqual(shareQuestions(10, [50, 50, 0]), [5, 5, 0]);
    assert.deepEqual(shareQuestions(12, [2, 50, 50]), [2, 5, 5]);
  });

  test("is short only when the whole bank is", () => {
    assert.deepEqual(shareQuestions(25, [3, 4, 0]), [3, 4, 0]);
    assert.deepEqual(shareQuestions(5, [0, 0, 0]), [0, 0, 0]);
  });

  test("a single subject takes the whole paper", () => {
    assert.deepEqual(shareQuestions(10, [7]), [7]);
    assert.deepEqual(shareQuestions(10, [70]), [10]);
  });
});

describe("full mock ids", () => {
  test("each sector covers Maths, English and its own language", () => {
    assert.deepEqual(subjectsCovered(fullMockId("az")), ["math", "english", "azerbaijani"]);
    assert.deepEqual(subjectsCovered(fullMockId("ru")), ["math", "english", "russian"]);
  });

  test("an ordinary subject covers only itself", () => {
    assert.deepEqual(subjectsCovered("azerbaijani"), ["azerbaijani"]);
    assert.equal(fullMockSector("math"), null);
    assert.equal(fullMockSector("mock-de"), null);
  });

  test("a mock has a name of its own", () => {
    assert.equal(subjectName("mock-az"), "Full mock (Azerbaijani sector)");
    assert.equal(subjectName("azerbaijani"), "Azerbaijani Language");
  });
});

describe("a pace is for each paper", () => {
  test("one subject keeps the preset as it is", () => {
    assert.deepEqual(resolveSettings("medium"), { questionCount: 25, timeLimitMinutes: 30 });
  });

  test("a full mock's three papers each get the whole pace", () => {
    assert.deepEqual(resolveSettings("medium", undefined, 3), { questionCount: 75, timeLimitMinutes: 90 });
    assert.deepEqual(resolveSettings("custom", { questionCount: 10, timeLimitMinutes: 20 }, 3), {
      questionCount: 30,
      timeLimitMinutes: 60
    });
  });

  test("an untimed custom mock stays untimed", () => {
    assert.deepEqual(resolveSettings("custom", { questionCount: 5, timeLimitMinutes: null }, 3), {
      questionCount: 15,
      timeLimitMinutes: null
    });
  });
});
