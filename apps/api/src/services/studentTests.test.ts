import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { BankQuestion, OwnQuestion, StudentTestDraft } from "@grade9/shared";
import { buildPaper, canSeeTest, checkDraft, isUploadedPicture, OWN_QUESTION_TOPIC } from "./studentTests";

const BUCKET = "https://project.supabase.co/storage/v1/object/public/question-images/";

function own(overrides: Partial<OwnQuestion> = {}): OwnQuestion {
  return {
    kind: "own",
    type: "multiple-choice",
    prompt: "What is 2 + 2?",
    options: ["3", "4", "5"],
    correctAnswer: "4",
    explanation: "",
    imageUrl: null,
    ...overrides
  };
}

function draft(overrides: Partial<StudentTestDraft> = {}): StudentTestDraft {
  return {
    title: "My quiz",
    subjectId: "math",
    difficulty: "medium",
    visibility: "friends",
    timeLimitMinutes: null,
    items: [own()],
    ...overrides
  };
}

function bankQuestion(overrides: Partial<BankQuestion> = {}): BankQuestion {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    subjectId: "math",
    topicId: "algebra",
    difficulty: "easy",
    type: "multiple-choice",
    prompt: "Bank question",
    options: ["a", "b"],
    correctAnswer: "a",
    marks: 2,
    explanation: "because",
    imageUrl: null,
    paperYear: null,
    source: null,
    status: "ready",
    translations: {},
    passageId: null,
    ...overrides
  } as BankQuestion;
}

const problemOf = (input: unknown) => {
  const result = checkDraft(input, { bucketPrefix: BUCKET });
  return "problem" in result ? result.problem : null;
};

describe("checkDraft", () => {
  test("a complete test passes", () => {
    assert.equal(problemOf(draft()), null);
  });

  test("needs a title, a known subject and at least one question", () => {
    assert.match(problemOf(draft({ title: "  " })) ?? "", /title/);
    assert.match(problemOf(draft({ subjectId: "chemistry" })) ?? "", /subject/);
    assert.match(problemOf(draft({ items: [] })) ?? "", /at least one question/);
  });

  test("a multiple choice question needs its answer among two or more distinct options", () => {
    assert.match(problemOf(draft({ items: [own({ options: ["4"] })] })) ?? "", /at least 2 options/);
    assert.match(problemOf(draft({ items: [own({ correctAnswer: "6" })] })) ?? "", /right one/);
    assert.match(problemOf(draft({ items: [own({ options: ["4", "4", "5"] })] })) ?? "", /twice/);
  });

  test("a short answer has no options", () => {
    assert.equal(problemOf(draft({ items: [own({ type: "short-answer", options: [], correctAnswer: "4" })] })), null);
    assert.match(
      problemOf(draft({ items: [own({ type: "short-answer", options: ["4"], correctAnswer: "4" })] })) ?? "",
      /no options/
    );
  });

  test("a multiple-select answer is stored in the options' order", () => {
    const result = checkDraft(
      draft({ items: [own({ type: "multiple-select", options: ["a", "b", "c"], correctAnswer: '["c","a"]' })] }),
      { bucketPrefix: BUCKET }
    );
    assert.ok("draft" in result);
    assert.equal((result.draft.items[0] as OwnQuestion).correctAnswer, '["a","c"]');
    assert.match(
      problemOf(draft({ items: [own({ type: "multiple-select", options: ["a", "b"], correctAnswer: '["z"]' })] })) ?? "",
      /one of the options/
    );
  });

  test("the same bank question cannot be picked twice", () => {
    const pick = { kind: "bank" as const, questionId: "11111111-1111-4111-8111-111111111111" };
    assert.match(problemOf(draft({ items: [pick, pick] })) ?? "", /already in the test/);
  });

  test("a picture must be one the upload made", () => {
    assert.equal(problemOf(draft({ items: [own({ imageUrl: `${BUCKET}abc.png` })] })), null);
    assert.match(problemOf(draft({ items: [own({ imageUrl: "https://evil.example/x.png" })] })) ?? "", /upload button/);
    assert.match(problemOf(draft({ items: [own({ imageUrl: `${BUCKET}../other/x.png` })] })) ?? "", /upload button/);
  });

  test("odd but fair text is taken as it is; too long is refused in words", () => {
    const odd = draft({
      title: "Şagirdlər üçün 🚀 test — ünvan",
      items: [own({ prompt: "Найдите x: 2x + 3 = 7 ✏️", options: ["2", "x²", "√(4)"], correctAnswer: "2" })]
    });
    assert.equal(problemOf(odd), null);
    assert.equal(problemOf(draft({ title: "t".repeat(120) })), null);
    assert.match(problemOf(draft({ title: "t".repeat(121) })) ?? "", /at most 120/);
    assert.match(problemOf(draft({ items: [own({ prompt: "p".repeat(2001) })] })) ?? "", /at most 2000/);
    assert.match(problemOf(draft({ items: [own({ options: ["a", "b", "c", "d", "e", "f", "g"], correctAnswer: "a" })] })) ?? "", /at most 6/);
  });

  test("no more questions than the limit", () => {
    assert.match(problemOf(draft({ items: Array.from({ length: 31 }, () => own()) })) ?? "", /at most 30/);
  });
});

describe("isUploadedPicture", () => {
  test("an inline picture only counts with no bucket (memory mode)", () => {
    const inline = "data:image/png;base64,iVBORw0KGgo=";
    assert.equal(isUploadedPicture(inline, null), true);
    assert.equal(isUploadedPicture(inline, BUCKET), false);
    assert.equal(isUploadedPicture("data:text/html;base64,PGI+", null), false);
  });
});

describe("canSeeTest", () => {
  const owner = "owner";
  test("a public test is for everyone, guests included", () => {
    assert.equal(canSeeTest({ ownerId: owner, visibility: "public" }, null, new Set()), true);
  });

  test("a friends-only test is for the owner and their friends", () => {
    const test = { ownerId: owner, visibility: "friends" as const };
    assert.equal(canSeeTest(test, owner, new Set()), true);
    assert.equal(canSeeTest(test, "friend", new Set([owner])), true);
    assert.equal(canSeeTest(test, "stranger", new Set(["someone-else"])), false);
    assert.equal(canSeeTest(test, null, new Set()), false);
  });
});

describe("buildPaper", () => {
  test("own questions and bank picks in order, positions closing up over a missing pick", () => {
    const kept = bankQuestion();
    const paper = buildPaper(
      {
        subjectId: "math",
        difficulty: "hard",
        items: [
          own(),
          { kind: "bank", questionId: "22222222-2222-4222-8222-222222222222" },
          { kind: "bank", questionId: kept.id },
          own({ type: "short-answer", options: [], correctAnswer: "1/5" })
        ]
      },
      new Map([[kept.id, kept]]),
      undefined
    );

    assert.deepEqual(
      paper.attempt.map((question) => question.position),
      [0, 1, 2]
    );
    assert.equal(paper.attempt[0].topicId, OWN_QUESTION_TOPIC);
    assert.equal(paper.attempt[0].difficulty, "hard");
    assert.equal(paper.attempt[0].questionId, null);
    assert.equal(paper.attempt[1].questionId, kept.id);
    assert.equal(paper.attempt[1].marks, 2);
    assert.equal(paper.attempt[2].correctAnswer, "1/5");
    assert.equal(paper.exam[0].id, "own-0");
  });

  test("the browser's copy carries no answers or explanations", () => {
    const paper = buildPaper({ subjectId: "math", difficulty: "easy", items: [own({ explanation: "secret" })] }, new Map(), undefined);
    const shown = JSON.stringify(paper.exam);
    assert.equal(shown.includes("correctAnswer"), false);
    assert.equal(shown.includes("secret"), false);
  });

  test("a pick that is no longer ready, or is a written answer, is left out", () => {
    const draftQuestion = bankQuestion({ id: "33333333-3333-4333-8333-333333333333", status: "draft" });
    const written = bankQuestion({ id: "44444444-4444-4444-8444-444444444444", type: "open-ended" });
    const paper = buildPaper(
      {
        subjectId: "math",
        difficulty: "easy",
        items: [
          { kind: "bank", questionId: draftQuestion.id },
          { kind: "bank", questionId: written.id }
        ]
      },
      new Map([
        [draftQuestion.id, draftQuestion],
        [written.id, written]
      ]),
      undefined
    );
    assert.equal(paper.exam.length, 0);
  });
});
