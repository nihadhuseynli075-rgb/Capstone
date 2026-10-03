import type { BankQuestion, ExamQuestion, SiteLanguage, TestSettings } from "@grade9/shared";
import { subjectName, topicName } from "@grade9/shared";
import { writtenMarkingEnabled } from "../lib/env";
import type { AttemptQuestion } from "../repositories/attemptRepository";
import { listQuestions } from "../repositories/questionRepository";
import { localizeQuestion } from "./questionTranslations";

export interface GeneratedTest {
  title: string;
  questions: BankQuestion[];
  requestedCount: number;
  /** True when the bank did not hold enough questions to fill the request. */
  short: boolean;
}

/** Fisher-Yates, so every question has an equal chance of being picked. */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/**
 * Draws a test out of the question bank.
 *
 * Picking a named difficulty restricts the pool to that difficulty. Custom mode
 * draws from every difficulty, since the student chose length and timing rather
 * than a difficulty band.
 *
 * `language` is the student's site language when they asked for the test. The
 * questions come back already in it, where their subject follows the site
 * language and a translation exists, so everything built from them (what the
 * student sees, and the copy marking works from) agrees with each other.
 */
export async function generateMockTest(
  settings: TestSettings,
  language?: SiteLanguage
): Promise<GeneratedTest> {
  const pool = await listQuestions({
    subjectId: settings.subjectId,
    topicIds: settings.topicIds.length > 0 ? settings.topicIds : undefined,
    difficulty: settings.difficultyMode === "custom" ? undefined : settings.difficultyMode,
    // A draft has no options or answer yet, and an image-pending one is missing
    // the diagram it is about.
    readyOnly: true,
    // A written answer needs the AI marker. Without one, never serve a
    // question nobody can mark.
    excludeTypes: writtenMarkingEnabled ? [] : ["open-ended"]
  });

  const picked = shuffle(pool)
    .slice(0, settings.questionCount)
    .map((question) => localizeQuestion(question, language));

  const topicLabel =
    settings.topicIds.length === 1
      ? topicName(settings.subjectId, settings.topicIds[0])
      : `${settings.topicIds.length} topics`;

  return {
    title: `${subjectName(settings.subjectId)} - ${topicLabel} mock test`,
    questions: picked,
    requestedCount: settings.questionCount,
    short: picked.length < settings.questionCount
  };
}

/**
 * The copy of a served question kept on the attempt.
 *
 * Marking and the results page both read this, never the bank, so what was
 * served, what is marked against and what is reviewed cannot drift apart. That
 * includes the language: a question served in Russian is marked against its
 * Russian options even if its translation is edited a minute later.
 */
export function toAttemptQuestion(question: BankQuestion, position: number): AttemptQuestion {
  return {
    questionId: question.id,
    position,
    subjectId: question.subjectId,
    topicId: question.topicId,
    difficulty: question.difficulty,
    type: question.type,
    prompt: question.prompt,
    options: question.options,
    correctAnswer: question.correctAnswer,
    marks: question.marks,
    explanation: question.explanation,
    imageUrl: question.imageUrl,
    studentAnswer: null,
    isCorrect: null,
    score: null,
    feedback: null
  };
}

/** Strips answers and explanations before a question is sent to the browser. */
export function toExamQuestion(question: BankQuestion): ExamQuestion {
  return {
    id: question.id,
    subjectId: question.subjectId,
    topicId: question.topicId,
    difficulty: question.difficulty,
    type: question.type,
    prompt: question.prompt,
    options: question.options,
    marks: question.marks,
    imageUrl: question.imageUrl
  };
}
