import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { subjects, topicIdFor } from "@grade9/shared";

// The admin form's topic box (apps/web/src/components/QuestionForm.tsx) turns
// what was typed into a topic id with this. It is in the shared package, which
// has no test runner of its own, so it is tested here with the rest.

const math = subjects.find((subject) => subject.id === "math")!.topics;

describe("topicIdFor", () => {
  test("a known topic's name is that topic, not a near-duplicate of it", () => {
    assert.equal(topicIdFor("Functions and Graphs", math), "functions");
    assert.equal(topicIdFor("Probability and Statistics", math), "probability");
  });

  test("however the name is cased or spaced", () => {
    assert.equal(topicIdFor("functions and graphs", math), "functions");
    assert.equal(topicIdFor("  Functions   And  Graphs ", math), "functions");
    assert.equal(topicIdFor("functions-and-graphs", math), "functions");
  });

  test("a known id stays itself, in any case", () => {
    assert.equal(topicIdFor("algebra", math), "algebra");
    assert.equal(topicIdFor("Algebra", math), "algebra");
    assert.equal(topicIdFor("functions", math), "functions");
  });

  test("a topic that is not known becomes a new id, written the way ids are", () => {
    assert.equal(topicIdFor("Number Theory", math), "number-theory");
    assert.equal(topicIdFor("coordinate-geometry", math), "coordinate-geometry");
  });

  test("only the subject's own topics count", () => {
    const english = subjects.find((subject) => subject.id === "english")!.topics;
    // "Functions and Graphs" is a maths topic; in English it is a new one.
    assert.equal(topicIdFor("Functions and Graphs", english), "functions-and-graphs");
    assert.equal(topicIdFor("Reading Comprehension", english), "reading");
  });
});
