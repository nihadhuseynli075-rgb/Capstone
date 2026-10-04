import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cleanName, isReadableName } from "@grade9/shared";

/** A name is refused when nothing readable is left once it is cleaned, as the profile route does it. */
function refused(name: string): boolean {
  return !isReadableName(cleanName(name));
}

describe("cleanName", () => {
  test("collapses runs of whitespace and trims, as before", () => {
    assert.equal(cleanName("  Nihad \t\n Huseynli  "), "Nihad Huseynli");
  });

  test("takes out characters that draw nothing", () => {
    assert.equal(cleanName("Ni​had⁠"), "Nihad");
    assert.equal(cleanName("‮Ali‏"), "Ali");
    assert.equal(cleanName("ㅤAyselㅤ"), "Aysel");
  });

  test("keeps letters from every script the students write in", () => {
    assert.equal(cleanName("İlkin Əliyev"), "İlkin Əliyev");
    assert.equal(cleanName("Иван Петров"), "Иван Петров");
  });
});

describe("readable names", () => {
  test("a name of zero-width spaces is refused like one of plain spaces", () => {
    assert.equal(refused("​​​"), true);
    assert.equal(refused("   "), true);
  });

  test("a name of Hangul fillers is refused, though Unicode calls them letters", () => {
    assert.equal(refused("ㅤㅤ"), true);
    assert.equal(refused("ᅟᅠﾠ"), true);
  });

  test("a name of punctuation alone is refused", () => {
    assert.equal(refused("-- .."), true);
  });

  test("real names, digits and names with an emoji pass", () => {
    assert.equal(refused("Ali"), false);
    assert.equal(refused("R2"), false);
    assert.equal(refused("😀 Ali"), false);
  });
});
