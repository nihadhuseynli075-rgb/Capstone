import { Router } from "express";
import { z } from "zod";
import type { MockTest, QuestionType, TestResult, TestSettings } from "@grade9/shared";
import {
  customLimits,
  resolveSettings,
  siteLanguages,
  studentKeyLimits,
  testScopeLimits,
  writtenAnswerMaxLength
} from "@grade9/shared";
import {
  claimAttempts,
  completeAttempt,
  createAttempt,
  getAttempt,
  listAttempts
} from "../repositories/attemptRepository";
import { compareToPrevious, markAttempt, resolveAnswers } from "../services/marking";
import { generateMockTest, toAttemptQuestion, toExamQuestion } from "../services/mockTestGenerator";
import { createRateLimiter } from "../services/rateLimiter";
import { markWrittenAnswers } from "../services/writtenMarking";
import {
  canClaimFrom,
  canUseStudentKey,
  isAuthenticatedStudent
} from "../modules/student/studentAuth";

export const testsRouter = Router();

/**
 * The student identifier.
 *
 * Supabase Auth is not wired up yet, so the browser generates and stores a key
 * locally and sends it with each request. Swapping this for a real user id later
 * is a change in one place.
 */
const studentKeySchema = z.string().min(studentKeyLimits.min).max(studentKeyLimits.max);

/**
 * The refusal for a paper already handed in, however it happened: submitted
 * earlier, or by another request a moment ago. The browser branches on `code`.
 */
const alreadySubmitted = {
  code: "already-submitted",
  message: "That test has already been submitted."
} as const;

const generateSchema = z
  .object({
    studentKey: studentKeySchema,
    // Bounded because both end up in the query string of the read that draws
    // the paper (see testScopeLimits).
    subjectId: z.string().min(1).max(testScopeLimits.maxIdLength),
    topicIds: z
      .array(z.string().min(1).max(testScopeLimits.maxIdLength))
      .min(1, "Choose at least one topic.")
      .max(testScopeLimits.maxTopics, `Choose at most ${testScopeLimits.maxTopics} topics.`),
    difficultyMode: z.enum(["easy", "medium", "hard", "custom"]),
    // The language the student has the site in. It is fixed for the paper: the
    // questions are copied onto the attempt in it, so changing the site language
    // halfway through does not change a question under their hands. Optional so
    // a tab from before this existed still gets a test, in the questions' own
    // text.
    language: z.enum(siteLanguages).optional(),
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

/**
 * Tests one address may generate in ten minutes.
 *
 * Generating needs no account and writes the attempt plus a row for every
 * question served, so this keeps a script from filling the database. A school
 * computer room shares one address: 30 students starting a test each minute
 * would be 300, so the limit sits at twice that. Behind a host's proxy the
 * address is only the student's own once TRUST_PROXY is set (see env.ts).
 */
const generateLimiter = createRateLimiter({ maxRequests: 600, windowMs: 10 * 60 * 1000 });

testsRouter.post("/generate", async (request, response, next) => {
  const waitMs = generateLimiter.take(request.ip ?? request.socket.remoteAddress ?? "unknown");

  if (waitMs > 0) {
    const seconds = Math.ceil(waitMs / 1000);
    response.setHeader("Retry-After", String(seconds));
    return response.status(429).json({
      code: "too-many-tests",
      retryAfterSeconds: seconds,
      message: "Too many tests were started from this connection. Wait a few minutes, then try again."
    });
  }

  const parsed = generateSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      message: "Those test settings are not valid.",
      issues: parsed.error.flatten()
    });
  }

  const { studentKey, subjectId, difficultyMode } = parsed.data;

  // A topic named twice is still one topic. The list is kept on the attempt
  // and the paper's heading counts it, so a repeat would read as "5 topics"
  // for a test drawn from two.
  const topicIds = [...new Set(parsed.data.topicIds)];

  const resolved = resolveSettings(difficultyMode, {
    questionCount: parsed.data.questionCount ?? customLimits.minQuestions,
    timeLimitMinutes: parsed.data.timeLimitMinutes ?? null
  });

  const settings: TestSettings = { subjectId, topicIds, difficultyMode, ...resolved };

  try {
    if (!(await canUseStudentKey(request, studentKey))) {
      return response.status(401).json({ message: "Sign in again to continue." });
    }

    const generated = await generateMockTest(settings, parsed.data.language);

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
      questions: generated.questions.map(toAttemptQuestion)
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

/**
 * The largest time taken the browser may send.
 *
 * Only a cap on what the browser says, never a reason to refuse. An untimed
 * test can honestly be open for longer, and refusing one that was cost the
 * student every answer: the retry sent the same figure and failed the same
 * way. The time recorded is bounded by the server's own measure anyway (see
 * the submit route), so a longer sitting still shows its real length.
 */
const MAX_CLAIMED_SECONDS = 60 * 60 * 6;

/**
 * Papers whose submission is being marked right now, in this process.
 *
 * Written answers go to a paid AI marker before the result is saved, and the
 * save is what decides which of two submissions wins. Without this, several
 * submissions of the same paper sent together (a double click, two tabs, a
 * script) would each pay to mark every written answer, only for one result to
 * be kept. A second submission while one is in flight gets the same refusal
 * the loser of the save would have got. The entry is removed whatever happens,
 * so a submission that fails can be retried. One API process holds all of
 * them; a deployment with several would need the claim in the database.
 */
const submissionsInFlight = new Set<string>();

const submitSchema = z.object({
  studentKey: studentKeySchema,
  timeTakenSeconds: z
    .number()
    .int()
    .min(0)
    .transform((seconds) => Math.min(seconds, MAX_CLAIMED_SECONDS)),
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      // Where the question sat in the paper. Optional so a tab that loaded
      // before this existed still submits and still marks the same way.
      position: z.number().int().min(0).optional(),
      // Written answers go to a paid marker, so a paste of a whole book is
      // refused rather than sent. Far beyond anything a Grade 9 task asks for.
      answer: z.string().max(writtenAnswerMaxLength)
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
    if (!(await canUseStudentKey(request, parsed.data.studentKey))) {
      return response.status(401).json({ message: "Sign in again to continue." });
    }

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
      return response.status(409).json(alreadySubmitted);
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

    // Never record less time than actually passed, whatever the browser claims,
    // and never much more either: the browser cannot have been open longer
    // than since the paper was generated. The grace covers a database clock a
    // little behind this one. A timed paper is never recorded as taking longer
    // than its limit, so a five-minute test cannot claim six hours.
    const believedSeconds = Math.min(
      Math.max(parsed.data.timeTakenSeconds, elapsedSeconds),
      elapsedSeconds + SUBMIT_GRACE_SECONDS
    );
    const timeTakenSeconds =
      limitMinutes === null ? believedSeconds : Math.min(believedSeconds, limitMinutes * 60);

    if (submissionsInFlight.has(attempt.id)) {
      return response.status(409).json(alreadySubmitted);
    }

    submissionsInFlight.add(attempt.id);

    try {
      // Written answers go to the AI marker first, all at once. One it cannot
      // reach comes back unmarked and is left out of the score, never failed.
      const written = await markWrittenAnswers(
        attempt.questions,
        resolveAnswers(attempt.questions, parsed.data.answers)
      );

      const marked = markAttempt(attempt.questions, parsed.data.answers, written);

      // Read history before saving, so this attempt is not compared against itself.
      // Headline figures only: the comparison never looks at topics.
      const history = await listAttempts(parsed.data.studentKey, { topicBreakdown: false });

      const recorded = await completeAttempt({
        attemptId: attempt.id,
        score: marked.score,
        totalMarks: marked.totalMarks,
        totalQuestions: marked.totalQuestions,
        percentage: marked.percentage,
        timeTakenSeconds,
        answers: marked.answers
      });

      // Another submission of this paper was recorded between the check above
      // and now: a second tab, or a retry racing the original. Its result is the
      // one kept, so this one is refused the same way a late resubmit is.
      if (!recorded) {
        return response.status(409).json(alreadySubmitted);
      }

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
    } finally {
      submissionsInFlight.delete(attempt.id);
    }
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
 * rest of the student endpoints already run on: the key is the credential. An
 * account's id is not a guest key, so it can never be claimed from.
 */
testsRouter.post("/claim", async (request, response, next) => {
  const parsed = z
    .object({ studentKey: studentKeySchema, guestKey: studentKeySchema })
    .safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({ message: "That request is not valid." });
  }

  try {
    if (!(await isAuthenticatedStudent(request, parsed.data.studentKey))) {
      return response.status(401).json({ message: "Sign in again to move guest history." });
    }

    if (!(await canClaimFrom(parsed.data.guestKey, parsed.data.studentKey))) {
      return response.status(403).json({
        message: "That history belongs to an account, so it cannot be moved."
      });
    }

    const claimed = await claimAttempts(parsed.data.guestKey, parsed.data.studentKey);
    response.json({ claimed });
  } catch (error) {
    next(error);
  }
});

testsRouter.get("/history", async (request, response, next) => {
  const studentKey = typeof request.query.studentKey === "string" ? request.query.studentKey : "";

  if (studentKey.length < studentKeyLimits.min) {
    return response.status(400).json({ message: "A student key is required." });
  }

  try {
    if (!(await canUseStudentKey(request, studentKey))) {
      return response.status(401).json({ message: "Sign in again to view this history." });
    }

    response.json({ attempts: await listAttempts(studentKey) });
  } catch (error) {
    next(error);
  }
});

/** Re-opens the review screen for a past attempt. */
testsRouter.get("/attempts/:attemptId", async (request, response, next) => {
  const studentKey = typeof request.query.studentKey === "string" ? request.query.studentKey : "";

  try {
    if (!(await canUseStudentKey(request, studentKey))) {
      return response.status(401).json({ message: "Sign in again to view this result." });
    }

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
        explanation: question.explanation,
        type: question.type as QuestionType,
        feedback: question.feedback,
        // Only a written answer the marker could not reach has neither.
        counted: !(question.score === null && question.isCorrect === null)
      }))
    });
  } catch (error) {
    next(error);
  }
});
