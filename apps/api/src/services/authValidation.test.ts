import assert from "node:assert/strict";
import { describe, test } from "node:test";
// Pure logic that lives in the web app; it only imports the shared package.
import { passwordProblem, passwordStrength } from "../../../web/src/features/auth/authValidation.js";

describe("passwordProblem", () => {
  test("accepts Latin, Cyrillic and Azerbaijani letters with a digit", () => {
    assert.equal(passwordProblem("password2010"), null);
    assert.equal(passwordProblem("пароль2010"), null);
    assert.equal(passwordProblem("новыйпароль1"), null);
    assert.equal(passwordProblem("şəhərım123"), null);
  });

  test("still wants a letter and a number", () => {
    assert.equal(passwordProblem("парольпароль"), "needs-letter-and-number");
    assert.equal(passwordProblem("12345678"), "needs-letter-and-number");
    assert.equal(passwordProblem("!!!!????"), "needs-letter-and-number");
  });

  test("empty and short come first", () => {
    assert.equal(passwordProblem(""), "empty");
    assert.equal(passwordProblem("п1"), "too-short");
  });
});

describe("passwordStrength", () => {
  test("a long mixed-case Cyrillic password with a digit and symbol is strong", () => {
    assert.equal(passwordStrength("Новыйпароль2010!").level, "strong");
  });

  test("scores Cyrillic and Latin the same", () => {
    assert.equal(passwordStrength("пароль2010").level, passwordStrength("parolx2010").level);
    assert.equal(passwordStrength("Пароль2010").level, passwordStrength("Parolx2010").level);
  });
});
