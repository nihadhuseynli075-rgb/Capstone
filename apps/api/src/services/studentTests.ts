import { z } from "zod";
import type {
  BankQuestion,
  ExamQuestion,
  OwnQuestion,
  SiteLanguage,
  StudentTest,
  StudentTestDraft,
  StudentTestItem
} from "@grade9/shared";
import {
  decodeAnswerSet,
  encodeAnswerSet,
  repeatedOption,
  studentQuestionTypes,
  studentTestLimits,
  subjects
} from "@grade9/shared";
import type { AttemptQuestion } from "../repositories/attemptRepository";
import { toAttemptQuestion, toExamQuestion } from "./mockTestGenerator";
import { localizeQuestion } from "./questionTranslations";

/**
 * The rules for tests students make themselves (18 Nov 2026), kept apart from
 * the routes and the database so they can be tested on their own: what a test
 * may hold, who may see it, and how it becomes a paper to sit.
 */

/** The topic a student's own question is filed under on results and history. */
export const OWN_QUESTION_TOPIC = "student-made";

const limits = studentTestLimits;
const subjectIds = subjects.map((subject) => subject.id);

const ownQuestionSchema = z.object({
  kind: z.literal("own"),
  type: z.enum(studentQuestionTypes as [OwnQuestion["type"], ...OwnQuestion["type"][]]),
  prompt: z
    .string()
    .trim()
    .min(1, "Every question needs its text.")
    .max(limits.maxPrompt, `A question can be at most ${limits.maxPrompt} characters.`),
  options: z
    .array(
      z
        .string()
        .trim()
        .min(1, "An option cannot be empty.")
        .max(limits.maxOption, `An option can be at most ${limits.maxOption} characters.`)
    )
    .max(limits.maxOptions, `A question can have at most ${limits.maxOptions} options.`)
    .default([]),
  correctAnswer: z
    .string()
    .trim()
    .min(1, "Every question needs its right answer.")
    .max(limits.maxAnswer * limits.maxOptions, "That answer is too long."),
  explanation: z
    .string()
    .trim()
    .max(limits.maxExplanation, `An explanation can be at most ${limits.maxExplanation} characters.`)
    .default(""),
  // A link the picture upload handed back, or none. Checked to be one of the
  // two shapes it hands back (see questionImages), so a test cannot carry a
  // link to anywhere else that its sitters' browsers would then load.
  imageUrl: z.string().max(4_000_000).nullable().default(null)
});

const bankPickSchema = z.object({
  kind: z.literal("bank"),
  questionId: z.string().uuid("That bank question is not one the bank has.")
});

export const studentTestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the test a title.")
    .max(limits.maxTitle, `A title can be at most ${limits.maxTitle} characters.`),
  subjectId: z.string().refine((id) => subjectIds.includes(id), { message: "Choose one of the subjects." }),
  difficulty: z.enum(["easy", "medium", "hard"]),
  visibility: z.enum(["friends", "public"]),
  timeLimitMinutes: z.number().int().min(1).max(limits.maxMinutes).nullable(),
  items: z
    .array(z.discriminatedUnion("kind", [ownQuestionSchema, bankPickSchema]))
    .min(1, "Add at least one question.")
    .max(limits.maxQuestions, `A test can have at most ${limits.maxQuestions} questions.`)
});

/**
 * Whether a picture link is one the upload made: the question-image bucket's
 * public address, or (with no Supabase, locally) an inline picture.
 */
export function isUploadedPicture(link: string, bucketPrefix: string | null): boolean {
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(link)) return bucketPrefix === null;
  return bucketPrefix !== null && link.startsWith(bucketPrefix) && !link.slice(bucketPrefix.length).includes("..");
}

/**
 * What is wrong with one of the student's own questions beyond its shape, in
 * words for the student, or null. `number` is its place in the test, from 1.
 */
export function ownQuestionProblem(question: OwnQuestion, number: number): string | null {
  const where = `Question ${number}:`;

  if (question.type === "short-answer") {
    return question.options.length === 0 ? null : `${where} a short answer has no options.`;
  }

  if (question.options.length < limits.minOptions) {
    return `${where} give at least ${limits.minOptions} options.`;
  }

  const repeated = repeatedOption(question.options);
  if (repeated !== null) return `${where} the option "${repeated}" is there twice.`;

  if (question.type === "multiple-choice") {
    return question.options.includes(question.correctAnswer)
      ? null
      : `${where} mark which option is the right one.`;
  }

  const chosen = decodeAnswerSet(question.correctAnswer);
  if (chosen.length === 0) return `${where} tick every option that is right.`;
  if (chosen.some((answer) => !question.options.includes(answer))) {
    return `${where} a right answer has to be one of the options.`;
  }
  return null;
}

/**
 * A draft checked and tidied, or the first problem with it. A multiple-select
 * answer is written again in the options' order (encodeAnswerSet), so two
 * tests with the same ticks store the same answer.
 */
export function checkDraft(
  input: unknown,
  pictureRules: { bucketPrefix: string | null }
): { draft: StudentTestDraft } | { problem: string } {
  const parsed = studentTestSchema.safeParse(input);
  if (!parsed.success) return { problem: parsed.error.issues[0]?.message ?? "That test is not valid." };

  const draft = parsed.data as StudentTestDraft;
  const seenBank = new Set<string>();

  const items: StudentTestItem[] = [];
  for (const [index, item] of draft.items.entries()) {
    if (item.kind === "bank") {
      // The same bank question twice would be marked twice.
      if (seenBank.has(item.questionId)) return { problem: `Question ${index + 1} is already in the test.` };
      seenBank.add(item.questionId);
      items.push(item);
      continue;
    }

    const problem = ownQuestionProblem(item, index + 1);
    if (problem) return { problem };

    if (item.imageUrl !== null && !isUploadedPicture(item.imageUrl, pictureRules.bucketPrefix)) {
      return { problem: `Question ${index + 1}: add the picture with the upload button.` };
    }

    items.push(
      item.type === "multiple-select"
        ? { ...item, correctAnswer: encodeAnswerSet(item.options, decodeAnswerSet(item.correctAnswer)) }
        : item
    );
  }

  return { draft: { ...draft, items } };
}

/**
 * Whether `viewer` may see and sit a test: everyone may sit a public one; a
 * friends-only one is for its owner and the owner's friends. A guest (null)
 * sees public tests only.
 */
export function canSeeTest(
  test: Pick<StudentTest, "ownerId" | "visibility">,
  viewer: string | null,
  friendsOfViewer: ReadonlySet<string>
): boolean {
  if (test.visibility === "public") return true;
  if (viewer === null) return false;
  return test.ownerId === viewer || friendsOfViewer.has(test.ownerId);
}

/** Bank question ids a test picks, in its order. */
export function bankIdsOf(items: readonly StudentTestItem[]): string[] {
  return items.flatMap((item) => (item.kind === "bank" ? [item.questionId] : []));
}

/** Whether a bank question can go on a student's paper: in the bank, ready, and marked without the AI marker. */
export function isPickable(question: BankQuestion | undefined): question is BankQuestion {
  return !!question && question.status === "ready" && question.type !== "open-ended";
}

/**
 * The paper a student-made test is sat as: the questions copied onto the
 * attempt (AttemptQuestion, with answers, kept on the server) and the same
 * questions as the browser sees them (ExamQuestion, without).
 *
 * A bank pick that has since left the bank, or is not ready, is left out
 * rather than failing the test; the positions close up behind it, so the
 * paper still marks by position. Bank questions come in the site language
 * where they have a translation, as on any other paper.
 */
export function buildPaper(
  test: Pick<StudentTest, "subjectId" | "difficulty" | "items">,
  bank: ReadonlyMap<string, BankQuestion>,
  language: SiteLanguage | undefined
): { attempt: AttemptQuestion[]; exam: ExamQuestion[] } {
  const attempt: AttemptQuestion[] = [];
  const exam: ExamQuestion[] = [];

  for (const item of test.items) {
    const position = attempt.length;

    if (item.kind === "bank") {
      const found = bank.get(item.questionId);
      if (!isPickable(found)) continue;
      const question = localizeQuestion(found, language);
      attempt.push(toAttemptQuestion(question, position));
      // No passage: a pick is one question, served without its reading text's
      // other questions, so its text would only be half the story. Picking is
      // offered for questions with no passage (see the bank route).
      exam.push(toExamQuestion(question));
      continue;
    }

    attempt.push({
      questionId: null,
      position,
      subjectId: test.subjectId,
      topicId: OWN_QUESTION_TOPIC,
      difficulty: test.difficulty,
      type: item.type,
      prompt: item.prompt,
      options: item.options,
      correctAnswer: item.correctAnswer,
      marks: 1,
      explanation: item.explanation,
      imageUrl: item.imageUrl,
      studentAnswer: null,
      isCorrect: null,
      score: null,
      feedback: null
    });
    exam.push({
      // Not a bank id: answers are matched by position first, and this keeps
      // the fallback match by id from ever meeting a real question's.
      id: `own-${position}`,
      subjectId: test.subjectId,
      topicId: OWN_QUESTION_TOPIC,
      difficulty: test.difficulty,
      type: item.type,
      prompt: item.prompt,
      options: item.options,
      marks: 1,
      imageUrl: item.imageUrl,
      passage: null
    });
  }

  return { attempt, exam };
}
