import { Router } from "express";
import { z } from "zod";
import type { MockTest, TestResult, TestSettings } from "@grade9/shared";
import { customLimits, resolveSettings } from "@grade9/shared";
import {
  claimAttempts,
  completeAttempt,
  createAttempt,
  getAttempt,
  listAttempts
} from "../repositories/attemptRepository";
import { compareToPrevious, markAttempt } from "../services/marking";
import { generateMockTest, toExamQuestion } from "../services/mockTestGenerator";

export const testsRouter = Router();

/**
 * The student identifier.
 *
 * Supabase Auth is not wired up yet, so the browser generates and stores a key
 * locally and sends it with each request. Swapping this for a real user id later
 * is a change in one place.
 */
const studentKeySchema = z.string().min(8).max(100);

const generateSchema = z
  .object({
    studentKey: studentKeySchema,
    subjectId: z.string().min(1),
    topicIds: z.array(z.string().min(1)).min(1, "Choose at least one topic."),
    difficultyMode: z.enum(["easy", "medium", "hard", "custom"]),
    questionCount: z
      .number()
      .int()
      .min(customLimits.minQuestions)
      .max(customLimits.maxQuestions)
      .optional(),
    timeLimitMinutes: z
      .number()
      .int()
      .min(customLimits.minMinutes)
      .max(customLimits.maxMinutes)
      .nullable()
      .optional()
  })
  .superRefine((value, context) => {
    // Difficulty presets carry their own count and timer; custom must supply one.
    if (value.difficultyMode === "custom" && value.questionCount === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questionCount"],
        message: "Custom tests need a question count."
      });
    }
  });

testsRouter.post("/generate", async (request, response, next) => {
  const parsed = generateSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      message: "Those test settings are not valid.",
      issues: parsed.error.flatten()
    });
  }

  const { studentKey, subjectId, topicIds, difficultyMode } = parsed.data;

  const resolved = resolveSettings(difficultyMode, {
    questionCount: parsed.data.questionCount ?? customLimits.minQuestions,
    timeLimitMinutes: parsed.data.timeLimitMinutes ?? null
  });

  const settings: TestSettings = { subjectId, topicIds, difficultyMode, ...resolved };

  try {
    const generated = await generateMockTest(settings);

    if (generated.questions.length === 0) {
      return response.status(409).json({
        message:
          "There are no questions in the bank for that subject, topic and difficulty yet. Add some in the admin dashboard first.",
        availableCount: 0
      });
    }

    const attempt = await createAttempt({
      studentKey,
      // Record the size actually served, so a short test still marks out of the
      // right total.
      settings: { ...settings, questionCount: generated.questions.length },
      questions: generated.questions.map((question, index) => ({
        questionId: question.id,
        position: index,
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
        score: null
      }))
    });

    const test: MockTest = {
      id: attempt.id,
      title: generated.title,
      settings: { ...settings, questionCount: generated.questions.length },
      questions: generated.questions.map(toExamQuestion),
      createdAt: attempt.createdAt
    };

    response.json({
      test,
      // Tell the student up front when the bank could not fill the request,
      // rather than letting a 10-question test silently arrive as 3.
      short: generated.short,
      requestedCount: generated.requestedCount
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Slack allowed on top of the time limit before a submission is refused.
 *
 * Covers a slow network, a clock that is slightly out, and the second or two
 * between the countdown hitting zero and the request arriving. Anything beyond
 * this is not lag, it is a test that was left open.
 */
const SUBMIT_GRACE_SECONDS = 60;

const submitSchema = z.object({
  studentKey: studentKeySchema,
  timeTakenSeconds: z.number().int().min(0).max(60 * 60 * 6),
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      // Where the question sat in the paper. Optional so a tab that loaded
      // before this existed still submits and still marks the same way.
      position: z.number().int().min(0).optional(),
      answer: z.string()
    })
  )
});

testsRouter.post("/:attemptId/submit", async (request, response, next) => {
  const parsed = submitSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      message: "That submission is not valid.",
      issues: parsed.error.flatten()
    });
  }

  try {
    const attempt = await getAttempt(request.params.attemptId);

    if (!attempt) {
      return response.status(404).json({ message: "That test could not be found." });
    }

    if (attempt.studentKey !== parsed.data.studentKey) {
      return response.status(403).json({ message: "That test belongs to a different student." });
    }

    // Both refusals below are final: no amount of retrying changes them. The
    // code says which, so the browser can send someone to the results that
    // already exist rather than leaving them on a paper they cannot put down.
    if (attempt.submittedAt) {
      return response.status(409).json({
        code: "already-submitted",
        message: "That test has already been submitted."
      });
    }

    // The countdown in the browser is a convenience, not a control: a student
    // can pause it, change the clock or simply come back tomorrow. The server
    // holds the only figure that matters, measured from when the test was
    // generated.
    const elapsedSeconds = Math.max(
      0,
      Math.round((Date.now() - new Date(attempt.createdAt).getTime()) / 1000)
    );

    const limitMinutes = attempt.settings.timeLimitMinutes;

    if (limitMinutes !== null && elapsedSeconds > limitMinutes * 60 + SUBMIT_GRACE_SECONDS) {
      return response.status(409).json({
        code: "time-expired",
        message:
          "The time limit for this test ran out, so it can no longer be submitted. Start a new test to try again."
      });
    }

    // Never record less time than actually passed, whatever the browser claims.
    const timeTakenSeconds = Math.min(parsed.data.timeTakenSeconds, elapsedSeconds);

    const marked = markAttempt(attempt.questions, parsed.data.answers);

    // Read history before saving, so this attempt is not compared against itself.
    const history = await listAttempts(parsed.data.studentKey);

    await completeAttempt({
      attemptId: attempt.id,
      score: marked.score,
      totalMarks: marked.totalMarks,
      totalQuestions: marked.totalQuestions,
      percentage: marked.percentage,
      timeTakenSeconds,
      answers: marked.answers
    });

    const result: TestResult = {
      attemptId: attempt.id,
      score: marked.score,
      totalMarks: marked.totalMarks,
      totalQuestions: marked.totalQuestions,
      percentage: marked.percentage,
      correctAnswers: marked.correctAnswers,
      incorrectAnswers: marked.incorrectAnswers,
      timeTakenSeconds,
      topicBreakdown: marked.topicBreakdown,
      reviews: marked.reviews,
      comparison: compareToPrevious(
        {
          percentage: marked.percentage,
          totalQuestions: marked.totalQuestions,
          difficultyMode: attempt.settings.difficultyMode
        },
        history
      )
    };

    response.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * Moves a guest's attempts onto a signed-in account.
 *
 * Someone can practise before making an account, so their tests are stored
 * against a key their browser generated. This pulls those across the first time
 * they sign in, rather than letting the history look wiped.
 *
 * Anyone holding a guest key can claim it, which is the same trust level the
 * rest of the student endpoints already run on: the key is the credential.
 */
testsRouter.post("/claim", async (request, response, next) => {
  const parsed = z
    .object({ studentKey: studentKeySchema, guestKey: studentKeySchema })
    .safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({ message: "That request is not valid." });
  }

  try {
    const claimed = await claimAttempts(parsed.data.guestKey, parsed.data.studentKey);
    response.json({ claimed });
  } catch (error) {
    next(error);
  }
});

testsRouter.get("/history", async (request, response, next) => {
  const studentKey = typeof request.query.studentKey === "string" ? request.query.studentKey : "";

  if (studentKey.length < 8) {
    return response.status(400).json({ message: "A student key is required." });
  }

  try {
    response.json({ attempts: await listAttempts(studentKey) });
  } catch (error) {
    next(error);
  }
});

/** Re-opens the review screen for a past attempt. */
testsRouter.get("/attempts/:attemptId", async (request, response, next) => {
  const studentKey = typeof request.query.studentKey === "string" ? request.query.studentKey : "";

  try {
    const attempt = await getAttempt(request.params.attemptId);

    if (!attempt) {
      return response.status(404).json({ message: "That test could not be found." });
    }

    if (attempt.studentKey !== studentKey) {
      return response.status(403).json({ message: "That test belongs to a different student." });
    }

    if (!attempt.submittedAt) {
      return response.status(409).json({ message: "That test has not been submitted yet." });
    }

    response.json({
      attemptId: attempt.id,
      settings: attempt.settings,
      score: attempt.score ?? 0,
      totalMarks:
        attempt.totalMarks ??
        attempt.questions.reduce((sum, question) => sum + question.marks, 0),
      totalQuestions: attempt.totalQuestions ?? attempt.questions.length,
      percentage: attempt.percentage ?? 0,
      timeTakenSeconds: attempt.timeTakenSeconds ?? 0,
      submittedAt: attempt.submittedAt,
      reviews: attempt.questions.map((question) => ({
        questionId: question.questionId ?? `position-${question.position}`,
        prompt: question.prompt,
        topicId: question.topicId,
        options: question.options,
        imageUrl: question.imageUrl,
        studentAnswer: question.studentAnswer ?? "",
        correctAnswer: question.correctAnswer,
        isCorrect: question.isCorrect ?? false,
        // Older rows predate per-question scores; a correct answer was worth
        // the question's marks, which were one each.
        score: question.score ?? (question.isCorrect ? question.marks : 0),
        marks: question.marks,
        explanation: question.explanation
      }))
    });
  } catch (error) {
    next(error);
  }
});
