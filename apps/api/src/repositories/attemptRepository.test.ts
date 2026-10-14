import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isMidSave } from "./attemptRepository";

const MINUTE = 60_000;
const NOW = Date.parse("2026-10-14T12:00:00.000Z");

/** An attempt as getAttempt reads it, as far as isMidSave looks at it. */
function attempt(submittedMinutesAgo: number | null, answers: Array<string | null>) {
  return {
    submittedAt: submittedMinutesAgo === null ? null : new Date(NOW - submittedMinutesAgo * MINUTE).toISOString(),
    questions: answers.map((studentAnswer) => ({ studentAnswer }))
  };
}

describe("isMidSave", () => {
  test("a paper not handed in is not being saved", () => {
    assert.equal(isMidSave(attempt(null, [null, null]), NOW), false);
  });

  test("submitted a moment ago with an answer not yet written, it is being saved", () => {
    // completeAttempt takes the attempt, then writes the answers a few at a time.
    assert.equal(isMidSave(attempt(0, ["4", null, null]), NOW), true);
    assert.equal(isMidSave(attempt(0, [null]), NOW), true);
  });

  test("once every answer is written it is saved, blank and unmarked ones included", () => {
    // A blank answer is written as "", and a written one the marker could not
    // reach keeps its text with no score: neither is an answer still missing.
    assert.equal(isMidSave(attempt(0, ["4", "", "An answer the marker never saw."]), NOW), false);
  });

  test("an answer missing from one submitted long ago is taken as it is", () => {
    // Ten minutes is the limit: one whose save failed and could not be
    // reopened, or saved by older code, would otherwise never open.
    assert.equal(isMidSave(attempt(10, [null]), NOW), true);
    assert.equal(isMidSave(attempt(10.001, [null]), NOW), false);
    assert.equal(isMidSave(attempt(60 * 24, [null]), NOW), false);
  });

  test("a submitted time that cannot be read counts as long ago", () => {
    assert.equal(isMidSave({ submittedAt: "not a time", questions: [{ studentAnswer: null }] }, NOW), false);
  });
});
