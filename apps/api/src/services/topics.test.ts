import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { subjects, topicName } from "@grade9/shared";

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
});
