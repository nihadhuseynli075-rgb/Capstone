import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { statusAfterSave } from "./questionStatus";

describe("statusAfterSave", () => {
  test("a question waiting for its picture keeps waiting when saved without one", () => {
    assert.equal(statusAfterSave("image-pending", { imageUrl: null }), "image-pending");
    assert.equal(statusAfterSave("image-pending", { imageUrl: "   " }), "image-pending");
  });

  test("attaching the picture is what makes it ready", () => {
    assert.equal(statusAfterSave("image-pending", { imageUrl: "https://example.test/diagram.png" }), "ready");
  });

  test("a draft saved complete through the form is ready, picture or not", () => {
    assert.equal(statusAfterSave("draft", { imageUrl: null }), "ready");
    assert.equal(statusAfterSave("draft", { imageUrl: "https://example.test/diagram.png" }), "ready");
  });

  test("a ready question stays ready, even with its picture taken off", () => {
    assert.equal(statusAfterSave("ready", { imageUrl: null }), "ready");
  });

  test("a new question is ready", () => {
    assert.equal(statusAfterSave(null, { imageUrl: null }), "ready");
  });
});
