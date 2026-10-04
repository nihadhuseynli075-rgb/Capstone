import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { containsPattern, containsText, needsTextCheck } from "../lib/likePattern";

describe("containsPattern", () => {
  test("wraps plain text in the two wildcards that make it 'anywhere'", () => {
    assert.equal(containsPattern("Komodo"), "%Komodo%");
  });

  test("a typed % or _ is a literal character, not a wildcard", () => {
    assert.equal(containsPattern("54%"), "%54\\%%");
    assert.equal(containsPattern("x_1"), "%x\\_1%");
    assert.equal(containsPattern("%"), "%\\%%");
  });

  test("a backslash is escaped too, so it cannot escape what follows it", () => {
    assert.equal(containsPattern("a\\b"), "%a\\\\b%");
    assert.equal(containsPattern("\\%"), "%\\\\\\%%");
  });

  test("no * reaches PostgREST, which would read it as %", () => {
    assert.equal(containsPattern("2 * 3"), "%2 _ 3%");
    assert.equal(containsPattern("*"), "%_%");
    // The "_" standing in for "*" is the only unescaped one.
    assert.equal(containsPattern("*_"), "%_\\_%");
  });
});

describe("needsTextCheck", () => {
  test("only a search with * can match rows without the text typed", () => {
    assert.equal(needsTextCheck("2 * 3"), true);
    assert.equal(needsTextCheck("54% x_1 a\\b"), false);
  });
});

describe("containsText", () => {
  test("finds the text anywhere, ignoring case", () => {
    assert.equal(containsText("Work out 2 * 3", "2 * 3"), true);
    assert.equal(containsText("KOMODO dragons", "komodo"), true);
  });

  test("a * is only matched by a *, as the rows Postgres returned are checked for", () => {
    assert.equal(containsText("Work out 2 + 3", "2 * 3"), false);
    assert.equal(containsText("Work out 2 x 3", "*"), false);
  });
});
