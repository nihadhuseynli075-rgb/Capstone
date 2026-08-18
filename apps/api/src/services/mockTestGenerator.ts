import type { BankQuestion, ExamQuestion, TestSettings } from "@grade9/shared";
import { subjectName, topicName } from "@grade9/shared";
import { listQuestions } from "../repositories/questionRepository";

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
 */
export async function generateMockTest(settings: TestSettings): Promise<GeneratedTest> {
  const pool = await listQuestions({
    subjectId: settings.subjectId,
    topicIds: settings.topicIds.length > 0 ? settings.topicIds : undefined,
    difficulty: settings.difficultyMode === "custom" ? undefined : settings.difficultyMode
  });

  const picked = shuffle(pool).slice(0, settings.questionCount);

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
    imageUrl: question.imageUrl
  };
}
