import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AttemptSummary } from "@grade9/shared";
import type { AttemptQuestion } from "../repositories/attemptRepository";
import { compareToPrevious, isAnswerCorrect, markAttempt } from "./marking";

function question(overrides: Partial<AttemptQuestion> = {}): AttemptQuestion {
  return {
    questionId: "q1",
    position: 1,
    subjectId: "math",
    topicId: "algebra",
    difficulty: "medium",
    type: "multiple-choice",
    prompt: "2 + 2 = ?",
    options: ["3", "4", "5"],
    correctAnswer: "4",
    marks: 1,
    explanation: "",
    imageUrl: null,
    studentAnswer: null,
    isCorrect: null,
    score: null,
    feedback: null,
    ...overrides
  };
}

function summary(overrides: Partial<AttemptSummary>): AttemptSummary {
  return {
    id: "a1",
    subjectId: "math",
    topicIds: ["algebra"],
    difficultyMode: "medium",
    score: 0,
    totalMarks: 10,
    totalQuestions: 10,
    percentage: 0,
    timeTakenSeconds: 600,
    submittedAt: "2026-09-01T10:00:00.000Z",
    ...overrides
  };
}

describe("isAnswerCorrect", () => {
  test("multiple choice must match the option exactly", () => {
    const mcq = question();
    assert.equal(isAnswerCorrect(mcq, "4"), true);
    assert.equal(isAnswerCorrect(mcq, "3"), false);
    assert.equal(isAnswerCorrect(mcq, " 4"), false);
  });

  test("short answer ignores case and extra spacing, nothing more", () => {
    const short = question({ type: "short-answer", options: [], correctAnswer: "New York" });
    assert.equal(isAnswerCorrect(short, "  new   york "), true);
    assert.equal(isAnswerCorrect(short, "NEW YORK"), true);
    assert.equal(isAnswerCorrect(short, "newyork"), false);
    assert.equal(isAnswerCorrect(short, "New York City"), false);
  });

  test("a blank answer is never correct", () => {
    assert.equal(isAnswerCorrect(question({ type: "short-answer", correctAnswer: " " }), "   "), false);
    assert.equal(isAnswerCorrect(question(), ""), false);
  });
});

describe("markAttempt", () => {
  test("scores by marks, not by questions answered", () => {
    const questions = [
      question({ questionId: "q1", position: 1, marks: 1 }),
      question({ questionId: "q2", position: 2, marks: 3 })
    ];

    const result = markAttempt(questions, [
      { questionId: "q1", position: 1, answer: "3" },
      { questionId: "q2", position: 2, answer: "4" }
    ]);

    assert.equal(result.score, 3);
    assert.equal(result.totalMarks, 4);
    assert.equal(result.percentage, 75);
    assert.equal(result.correctAnswers, 1);
    assert.equal(result.incorrectAnswers, 1);
    assert.deepEqual(
      result.answers.map((answer) => answer.score),
      [0, 3]
    );
  });

  test("rounds the percentage to one decimal place", () => {
    const questions = [1, 2, 3].map((position) => question({ questionId: `q${position}`, position }));
    const result = markAttempt(questions, [{ questionId: "q1", position: 1, answer: "4" }]);
    assert.equal(result.percentage, 33.3);
  });

  test("an unanswered question is blank and wrong", () => {
    const result = markAttempt([question()], []);
    assert.equal(result.score, 0);
    assert.equal(result.reviews[0].studentAnswer, "");
    assert.equal(result.reviews[0].isCorrect, false);
  });

  test("matches by position, so a question deleted from the bank still marks", () => {
    const deleted = question({ questionId: null, position: 1 });
    const result = markAttempt([deleted], [{ questionId: "q1", position: 1, answer: "4" }]);
    assert.equal(result.score, 1);
    assert.equal(result.reviews[0].questionId, "position-1");
  });

  test("falls back to the question id when an older tab sends no position", () => {
    const result = markAttempt([question()], [{ questionId: "q1", answer: "4" }]);
    assert.equal(result.score, 1);
  });

  test("breaks the score down by topic", () => {
    const questions = [
      question({ questionId: "q1", position: 1, topicId: "algebra", marks: 2 }),
      question({ questionId: "q2", position: 2, topicId: "algebra", marks: 1 }),
      question({ questionId: "q3", position: 3, topicId: "geometry", marks: 1 })
    ];

    const result = markAttempt(questions, [
      { questionId: "q1", position: 1, answer: "4" },
      { questionId: "q3", position: 3, answer: "4" }
    ]);

    assert.deepEqual(result.topicBreakdown, [
      { topicId: "algebra", score: 2, marks: 3 },
      { topicId: "geometry", score: 1, marks: 1 }
    ]);
  });

  test("an empty paper scores zero rather than dividing by zero", () => {
    const result = markAttempt([], []);
    assert.equal(result.percentage, 0);
    assert.equal(result.totalMarks, 0);
  });
});

describe("compareToPrevious", () => {
  test("the first attempt is a personal best", () => {
    const current = { percentage: 40, totalQuestions: 10, difficultyMode: "easy" as const };
    assert.deepEqual(compareToPrevious(current, []), { isPersonalBest: true, matchedBest: false, previousBest: null });
  });

  test("a perfect easy test does not outrank a strong hard one", () => {
    const hard = summary({ id: "hard", difficultyMode: "hard", percentage: 90, totalQuestions: 50 });
    const current = { percentage: 100, totalQuestions: 10, difficultyMode: "easy" as const };

    const comparison = compareToPrevious(current, [hard]);

    assert.equal(comparison.isPersonalBest, false);
    assert.equal(comparison.previousBest?.percentage, 90);
    assert.equal(comparison.previousBest?.difficultyMode, "hard");
  });

  test("reports the strongest earlier attempt as the one to beat", () => {
    const history = [
      summary({ id: "a", percentage: 50 }),
      summary({ id: "b", percentage: 80, submittedAt: "2026-09-10T10:00:00.000Z" }),
      summary({ id: "c", percentage: 60 })
    ];
    const current = { percentage: 70, totalQuestions: 10, difficultyMode: "medium" as const };

    const comparison = compareToPrevious(current, history);

    assert.equal(comparison.isPersonalBest, false);
    assert.equal(comparison.previousBest?.takenAt, "2026-09-10T10:00:00.000Z");
  });

  test("equalling the best is a match, not a new personal best", () => {
    const history = [summary({ percentage: 80 })];
    const current = { percentage: 80, totalQuestions: 10, difficultyMode: "medium" as const };
    const comparison = compareToPrevious(current, history);

    assert.equal(comparison.isPersonalBest, false);
    assert.equal(comparison.matchedBest, true);
  });

  test("beating the best is a new personal best and not a match", () => {
    const history = [summary({ percentage: 80 })];
    const current = { percentage: 90, totalQuestions: 10, difficultyMode: "medium" as const };
    const comparison = compareToPrevious(current, history);

    assert.equal(comparison.isPersonalBest, true);
    assert.equal(comparison.matchedBest, false);
  });

  test("names the subject the best was in, which can differ from this test's", () => {
    const history = [summary({ subjectId: "math", percentage: 30, difficultyMode: "easy" })];
    const current = { percentage: 20, totalQuestions: 10, difficultyMode: "easy" as const };
    assert.equal(compareToPrevious(current, history).previousBest?.subjectId, "math");
  });
});
