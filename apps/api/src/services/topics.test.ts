import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { subjects, titleCase, topicIdFor, topicName } from "@grade9/shared";

/**
 * Every subject and topic pair the seeded bank uses, read off the seed itself
 * so a topic added to the sheet without a name here is caught.
 */
function seededTopics(): Array<[string, string]> {
  const seed = readFileSync(
    fileURLToPath(new URL("../../../../supabase/seeds/all-questions.sql", import.meta.url)),
    "utf8"
  );
  const pairs = new Set<string>();

  for (const match of seed.matchAll(/'(math|english|russian)', '([a-z0-9-]+)'/g)) {
    pairs.add(`${match[1]}:${match[2]}`);
  }

  return [...pairs].map((pair) => pair.split(":") as [string, string]);
}

describe("topic names", () => {
  test("every topic in the seeded bank has a written name, not one made from its id", () => {
    const pairs = seededTopics();
    assert.ok(pairs.length > 10, `read ${pairs.length} topics from the seed`);

    for (const [subjectId, topicId] of pairs) {
      const subject = subjects.find((item) => item.id === subjectId);
      assert.ok(
        subject?.topics.some((topic) => topic.id === topicId),
        `${subjectId} / ${topicId} has no name in packages/shared`
      );
    }
  });

  test("sets-logic reads as a phrase", () => {
    assert.equal(topicName("math", "sets-logic"), "Sets and Logic");
  });

  test("a topic nobody has named yet still gets a readable name", () => {
    assert.equal(topicName("math", "vectors-in-space"), "Vectors In Space");
  });

  // Typed in the admin form, made into an id there, and named from the id.
  test("a topic typed in Azerbaijani or Russian reads as it was typed", () => {
    const math = subjects.find((subject) => subject.id === "math")!.topics;
    assert.equal(topicName("math", topicIdFor("Həndəsə", math)), "Həndəsə");
    assert.equal(topicName("math", topicIdFor("Тригонометрия", math)), "Тригонометрия");
    assert.equal(topicName("math", topicIdFor("Kvadrat tənliklər", math)), "Kvadrat Tənliklər");
    assert.equal(topicName("math", topicIdFor("İkinci dərəcəli funksiya", math)), "İkinci Dərəcəli Funksiya");
  });

  test("an apostrophe does not start a new word", () => {
    const english = subjects.find((subject) => subject.id === "english")!.topics;
    assert.equal(topicName("english", topicIdFor("pupil's book", english)), "Pupil's Book");
    assert.equal(topicName("english", "students’-book"), "Students’ Book");
  });
});

describe("titleCase", () => {
  test("capitalises the first letter of each word and leaves the rest alone", () => {
    assert.equal(titleCase("həndəsə"), "Həndəsə");
    assert.equal(titleCase("тригонометрия и векторы"), "Тригонометрия И Векторы");
    assert.equal(titleCase("pupil's book"), "Pupil's Book");
    assert.equal(titleCase("o'clock"), "O'clock");
    assert.equal(titleCase("McDonald"), "McDonald");
  });

  test("a word starts after a space, a hyphen or a slash", () => {
    assert.equal(titleCase("coca-cola"), "Coca-Cola");
    assert.equal(titleCase("ratio/proportion"), "Ratio/Proportion");
    assert.equal(titleCase("speed,  distance\tand time"), "Speed,  Distance\tAnd Time");
  });

  test("opening punctuation is passed over, and a word starting with a digit is left alone", () => {
    assert.equal(titleCase("(advanced) algebra"), "(Advanced) Algebra");
    assert.equal(titleCase("«грамматика»"), "«Грамматика»");
    assert.equal(titleCase("3rd year"), "3rd Year");
    assert.equal(titleCase("2d shapes"), "2d Shapes");
  });

  test("the Azerbaijani i's get their own capitals", () => {
    // "İ" lowercased is "i" and a loose dot: it comes back as the one letter.
    assert.equal(titleCase("İkinci".toLowerCase()), "İkinci");
    assert.equal(titleCase("ıspanaq"), "Ispanaq");
  });

  test("nothing to capitalise is left as it was", () => {
    assert.equal(titleCase(""), "");
    assert.equal(titleCase("2026"), "2026");
    assert.equal(titleCase("Already Capitalised"), "Already Capitalised");
  });
});
