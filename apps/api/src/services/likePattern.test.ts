import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { containsPattern } from "../lib/likePattern";

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
});
