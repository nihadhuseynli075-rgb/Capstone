import type { BankQuestion, ExamPassage, ExamQuestion, SiteLanguage, TestSettings } from "@grade9/shared";
import { fullMockSector, subjectName, subjectsCovered, topicName } from "@grade9/shared";
import { writtenMarkingEnabled } from "../lib/env";
import type { AttemptQuestion } from "../repositories/attemptRepository";
import { examPassages } from "../repositories/passageRepository";
import { listQuestions } from "../repositories/questionRepository";
import { localizeQuestion } from "./questionTranslations";

export interface GeneratedTest {
  title: string;
  questions: BankQuestion[];
  requestedCount: number;
  /** True when the bank did not hold enough questions to fill the request. */
  short: boolean;
  /** The reading passages the questions point at, by id, to be shown beside them. */
  passages: Map<string, ExamPassage>;
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
 * A subject's questions as the units a paper is drawn in, in random order:
 * each passage's questions together, in the passage's own order (numbered
 * ones first, then the rest by id), and every other question on its own.
 *
 * Nihad asked for this on 7 Nov 2026: drawn one by one, five questions on one
 * text came scattered through the paper, between maths questions, and the
 * student had to go back and find the text again each time.
 */
export function drawingUnits(questions: BankQuestion[]): BankQuestion[][] {
  const byPassage = new Map<string, BankQuestion[]>();
  const units: BankQuestion[][] = [];

  for (const question of questions) {
    if (!question.passageId) {
      units.push([question]);
      continue;
    }
    const group = byPassage.get(question.passageId);
    if (group) {
      group.push(question);
    } else {
      const fresh = [question];
      byPassage.set(question.passageId, fresh);
      units.push(fresh);
    }
  }

  const order = (question: BankQuestion) => question.passageOrder ?? Number.MAX_SAFE_INTEGER;
  for (const group of byPassage.values()) {
    group.sort((a, b) => order(a) - order(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  return shuffle(units);
}

/**
 * The first `count` questions of a subject's units, a whole unit at a time
 * where it fits. A passage with more questions than are left gives its first
 * ones, so the paper is still exactly the size asked for.
 */
export function takeFromUnits(units: BankQuestion[][], count: number): BankQuestion[] {
  const picked: BankQuestion[] = [];
  for (const unit of units) {
    if (picked.length >= count) break;
    picked.push(...unit.slice(0, count - picked.length));
  }
  return picked;
}

/**
 * How many questions each subject gives a paper of `count`, given how many
 * each can supply: as even a share as the bank allows. The share one subject
 * cannot fill goes to the others, so a full mock is short only when the bank
 * as a whole is. Any question left over after an even split goes to the
 * subjects first in the list (Maths, then English), as a paper prints them.
 */
export function shareQuestions(count: number, available: number[]): number[] {
  const shares = available.map(() => 0);
  let left = Math.min(
    count,
    available.reduce((total, n) => total + n, 0)
  );

  while (left > 0) {
    const open = available.map((n, index) => index).filter((index) => shares[index] < available[index]);
    const each = Math.max(1, Math.floor(left / open.length));

    for (const index of open) {
      if (left === 0) break;
      const take = Math.min(each, available[index] - shares[index], left);
      shares[index] += take;
      left -= take;
    }
  }

  return shares;
}

/**
 * Draws a test out of the question bank.
 *
 * Picking a named difficulty restricts the pool to that difficulty. Custom mode
 * draws from every difficulty, unless the student chose one for it
 * (`customDifficulty`), when it keeps to that one.
 *
 * A full mock (see fullMockId) draws from each of its three subjects in turn,
 * every topic of each, an even share apiece (see shareQuestions). Its
 * questions come subject by subject, Maths first, the way the exam is printed,
 * and in random order within each.
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
  const difficulty =
    settings.difficultyMode === "custom"
      ? settings.customDifficulty === undefined || settings.customDifficulty === "mixed"
        ? undefined
        : settings.customDifficulty
      : settings.difficultyMode;

  const sector = fullMockSector(settings.subjectId);
  const subjectIds = subjectsCovered(settings.subjectId);

  const pools = await Promise.all(
    subjectIds.map(async (subjectId) =>
      drawingUnits(
        await listQuestions({
          subjectId,
          // A full mock covers every topic; only a single subject is narrowed.
          topicIds: !sector && settings.topicIds.length > 0 ? settings.topicIds : undefined,
          difficulty,
          // A draft has no options or answer yet, and an image-pending one is missing
          // the diagram it is about.
          readyOnly: true,
          // A written answer needs the AI marker. Without one, never serve a
          // question nobody can mark.
          excludeTypes: writtenMarkingEnabled ? [] : ["open-ended"]
        })
      )
    )
  );

  const shares = shareQuestions(
    settings.questionCount,
    pools.map((units) => units.reduce((total, unit) => total + unit.length, 0))
  );

  const picked = pools
    .flatMap((units, index) => takeFromUnits(units, shares[index]))
    .map((question) => localizeQuestion(question, language));

  const passages = await examPassages(picked.flatMap((question) => (question.passageId ? [question.passageId] : [])));

  const topicLabel =
    settings.topicIds.length === 1
      ? topicName(settings.subjectId, settings.topicIds[0])
      : `${settings.topicIds.length} topics`;

  return {
    title: sector ? subjectName(settings.subjectId) : `${subjectName(settings.subjectId)} - ${topicLabel} mock test`,
    questions: picked,
    requestedCount: settings.questionCount,
    short: picked.length < settings.questionCount,
    passages
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

/**
 * Strips answers and explanations before a question is sent to the browser,
 * and puts its passage beside it. A passage that could not be found (deleted
 * a moment ago) leaves the question without one rather than failing the test.
 */
export function toExamQuestion(question: BankQuestion, passages?: Map<string, ExamPassage>): ExamQuestion {
  return {
    passage: (question.passageId && passages?.get(question.passageId)) || null,
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
