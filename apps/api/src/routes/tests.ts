import { Router } from "express";
import { z } from "zod";
import type { MockTest, TestResult, TestSettings } from "@grade9/shared";
import { customLimits, resolveSettings } from "@grade9/shared";
import {
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
        explanation: question.explanation,
        imageUrl: question.imageUrl,
        studentAnswer: null,
        isCorrect: null
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

const submitSchema = z.object({
  studentKey: studentKeySchema,
  timeTakenSeconds: z.number().int().min(0).max(60 * 60 * 6),
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
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

    if (attempt.submittedAt) {
      return response.status(409).json({ message: "That test has already been submitted." });
    }

    const marked = markAttempt(attempt.questions, parsed.data.answers);

    // Read history before saving, so this attempt is not compared against itself.
    const history = await listAttempts(parsed.data.studentKey);

    await completeAttempt({
      attemptId: attempt.id,
      score: marked.score,
      totalQuestions: marked.totalQuestions,
      percentage: marked.percentage,
      timeTakenSeconds: parsed.data.timeTakenSeconds,
      answers: marked.answers
    });

    const result: TestResult = {
      attemptId: attempt.id,
      score: marked.score,
      totalQuestions: marked.totalQuestions,
      percentage: marked.percentage,
      correctAnswers: marked.correctAnswers,
      incorrectAnswers: marked.incorrectAnswers,
      timeTakenSeconds: parsed.data.timeTakenSeconds,
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
        explanation: question.explanation
      }))
    });
  } catch (error) {
    next(error);
  }
});
