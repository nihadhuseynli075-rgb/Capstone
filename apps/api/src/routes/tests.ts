import { Router } from "express";
import { z } from "zod";
import { createStarterMockTest } from "../services/mockTestGenerator";

const testSettingsSchema = z.object({
  subjectId: z.string(),
  topicIds: z.array(z.string()).min(1),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]),
  questionType: z.enum(["multiple-choice", "short-answer", "mixed"]),
  questionCount: z.number().int().min(1).max(50),
  timeLimitMinutes: z.number().int().min(1).max(180)
});

export const testsRouter = Router();

testsRouter.post("/generate", (request, response) => {
  const parsed = testSettingsSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      message: "Invalid test settings",
      issues: parsed.error.flatten()
    });
  }

  return response.json(createStarterMockTest(parsed.data));
});

testsRouter.post("/:testId/submit", (_request, response) => {
  response.json({
    score: 0,
    percentage: 0,
    correctAnswers: 0,
    incorrectAnswers: 0,
    timeTakenSeconds: 0,
    topicBreakdown: [],
    message: "Submission marking is a placeholder for the next implementation milestone."
  });
});
