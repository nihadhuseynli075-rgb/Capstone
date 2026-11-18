import { Router, type Request } from "express";
import { z } from "zod";
import type { BankQuestion, ExamQuestion, MockTest, TestSettings } from "@grade9/shared";
import { siteLanguages, studentKeyLimits, studentTestLimits } from "@grade9/shared";
import { env } from "../lib/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { accountOf, requireAccount } from "../modules/student/requireAccount";
import { canUseStudentKey, signedInAccount } from "../modules/student/studentAuth";
import { createAttempt } from "../repositories/attemptRepository";
import { friendIdsOf, peopleById } from "../repositories/friendRepository";
import { getQuestion, listQuestions } from "../repositories/questionRepository";
import {
  countOwnTests,
  createTest,
  deleteTest,
  getTest,
  listOwnTests,
  listPublicTests,
  listTestsBy,
  updateTest
} from "../repositories/studentTestRepository";
import { toExamQuestion } from "../services/mockTestGenerator";
import { imageUploadSchema, storeQuestionImage } from "../services/questionImages";
import { createRateLimiter } from "../services/rateLimiter";
import { bankIdsOf, buildPaper, canSeeTest, checkDraft, isPickable } from "../services/studentTests";

/**
 * Tests students make themselves (session of 18 Nov 2026): put together from
 * questions they write and questions they pick from the bank, shared with
 * their friends or published for everyone, and sat like any other test.
 *
 * Two routers. `studentTestsRouter` is the owner's and the friends' side and
 * needs a signed-in account, as the friends routes do. `studentTestSittingRouter`
 * starts a sitting: a published test can be sat by a guest too, so it takes a
 * student key, as generating a test does, and checks who may see the test
 * itself (see canSeeTest).
 */

const unavailable = {
  code: "student-tests-unavailable",
  message:
    "Tests made by students need real accounts, and the API is not connected to Supabase. Set SUPABASE_SECRET_KEY in .env and restart the API."
} as const;

/** Where the upload puts pictures (see questionImages), so a test can only show pictures from there. */
function bucketPrefix(): string | null {
  if (!supabaseAdmin || !env.supabaseUrl) return null;
  return `${env.supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${env.questionImageBucket}/`;
}

function addressOf(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? "unknown";
}

/** The bank questions a test picks, by id. One read each: a test holds at most a few dozen. */
async function picksOf(ids: string[]): Promise<Map<string, BankQuestion>> {
  const found = await Promise.all(ids.map((id) => getQuestion(id)));
  const bank = new Map<string, BankQuestion>();
  for (const question of found) if (question) bank.set(question.id, question);
  return bank;
}

// ---------------------------------------------------------------------------
// The owner's and friends' side
// ---------------------------------------------------------------------------

export const studentTestsRouter = Router();

studentTestsRouter.use(requireAccount(unavailable));

/**
 * The student's own tests, questions and answers included, for editing, with
 * the bank questions they picked as a student sees them (no answers).
 */
studentTestsRouter.get("/mine", async (_request, response, next) => {
  try {
    const tests = await listOwnTests(accountOf(response).id);
    const bank = await picksOf([...new Set(tests.flatMap((test) => bankIdsOf(test.items)))]);
    const picks: Record<string, ExamQuestion | null> = {};
    for (const id of new Set(tests.flatMap((test) => bankIdsOf(test.items)))) {
      const question = bank.get(id);
      // Null when the bank no longer has it ready: the builder says so, and
      // sitting leaves it out.
      picks[id] = isPickable(question) ? toExamQuestion(question) : null;
    }
    response.json({ tests, picks });
  } catch (error) {
    next(error);
  }
});

/** Tests published for everyone, newest first. */
studentTestsRouter.get("/community", async (_request, response, next) => {
  try {
    response.json({ tests: await listPublicTests() });
  } catch (error) {
    next(error);
  }
});

/**
 * A friend's page: who they are and the tests they made. Only for the
 * student themselves and their friends; anybody else is answered as not
 * found, so the route tells a stranger nothing about an account.
 */
studentTestsRouter.get("/people/:accountId", async (request, response, next) => {
  const me = accountOf(response).id;
  const them = request.params.accountId;

  try {
    const isMe = them === me;
    if (!isMe && !(await friendIdsOf(me)).has(them)) {
      return response.status(404).json({ code: "not-friends", message: "That student is not one of your friends." });
    }

    const person = (await peopleById([them])).get(them);
    if (!person) {
      return response.status(404).json({ code: "not-friends", message: "That student is not one of your friends." });
    }

    response.json({ person, isMe, tests: await listTestsBy(them, true) });
  } catch (error) {
    next(error);
  }
});

const bankQuerySchema = z.object({
  subject: z.string().min(1).max(64),
  topic: z.string().min(1).max(64).optional(),
  search: z.string().trim().max(100).optional()
});

/** Bank questions shown when picking. Fewer than all of them: a search narrows them down. */
const BANK_PAGE = 40;

/**
 * Bank questions a student can pick for a test: ready, not written answers
 * (the AI marker is the admin's to pay for), and not part of a reading
 * passage (one question of a passage is only half of it). Without answers or
 * explanations, as any test shows them: picking is not a way to read the key.
 */
studentTestsRouter.get("/bank", async (request, response, next) => {
  const parsed = bankQuerySchema.safeParse(request.query);
  if (!parsed.success) return response.status(400).json({ message: "Choose a subject." });

  try {
    const questions = await listQuestions({
      subjectId: parsed.data.subject,
      topicIds: parsed.data.topic ? [parsed.data.topic] : undefined,
      search: parsed.data.search || undefined,
      readyOnly: true,
      excludeTypes: ["open-ended"]
    });
    response.json({
      questions: questions
        .filter((question) => question.passageId === null)
        .slice(0, BANK_PAGE)
        .map((question) => toExamQuestion(question))
    });
  } catch (error) {
    next(error);
  }
});

studentTestsRouter.post("/", async (request, response, next) => {
  const me = accountOf(response).id;
  const checked = checkDraft(request.body, { bucketPrefix: bucketPrefix() });
  if ("problem" in checked) return response.status(400).json({ message: checked.problem });

  try {
    if ((await countOwnTests(me)) >= studentTestLimits.maxTests) {
      return response.status(409).json({
        code: "too-many-tests",
        message: `You can keep up to ${studentTestLimits.maxTests} tests. Delete one to make another.`
      });
    }
    response.status(201).json({ test: await createTest(me, checked.draft) });
  } catch (error) {
    next(error);
  }
});

studentTestsRouter.put("/:id", async (request, response, next) => {
  const checked = checkDraft(request.body, { bucketPrefix: bucketPrefix() });
  if ("problem" in checked) return response.status(400).json({ message: checked.problem });

  try {
    const test = await updateTest(accountOf(response).id, request.params.id, checked.draft);
    if (!test) return response.status(404).json({ code: "gone", message: "That test is no longer there." });
    response.json({ test });
  } catch (error) {
    next(error);
  }
});

studentTestsRouter.delete("/:id", async (request, response, next) => {
  try {
    if (!(await deleteTest(accountOf(response).id, request.params.id))) {
      return response.status(404).json({ code: "gone", message: "That test is no longer there." });
    }
    response.json({ done: true });
  } catch (error) {
    next(error);
  }
});

/**
 * Pictures one account may add to its tests in an hour. Each is up to 2 MB in
 * the bucket, so this keeps one account from filling it; a test of thirty
 * questions with a picture each still fits in an hour.
 */
const imageLimiter = createRateLimiter({ maxRequests: 40, windowMs: 60 * 60 * 1000 });

studentTestsRouter.post("/image", async (request, response, next) => {
  const parsed = imageUploadSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ message: parsed.error.issues[0]?.message ?? "That upload is not valid." });
  }

  const waitMs = imageLimiter.take(accountOf(response).id);
  if (waitMs > 0) {
    response.setHeader("Retry-After", String(Math.ceil(waitMs / 1000)));
    return response.status(429).json({
      code: "too-many-pictures",
      message: "You have added a lot of pictures in the last hour. Wait a while, then try again."
    });
  }

  try {
    const stored = await storeQuestionImage(parsed.data);
    if ("status" in stored) return response.status(stored.status).json({ message: stored.message });
    response.json({ imageUrl: stored.imageUrl });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Sitting a test
// ---------------------------------------------------------------------------

export const studentTestSittingRouter = Router();

const startSchema = z.object({
  studentKey: z.string().min(studentKeyLimits.min).max(studentKeyLimits.max),
  language: z.enum(siteLanguages).optional()
});

/** Sittings one address may start in ten minutes, as many as generating a test allows (see the tests routes). */
const startLimiter = createRateLimiter({ maxRequests: 600, windowMs: 10 * 60 * 1000 });

/**
 * Starts a sitting of a student-made test, answered exactly as generating a
 * test is, so the exam page, marking, results and history need nothing new.
 * A test the student may not see is answered as not found.
 */
studentTestSittingRouter.post("/:id/start", async (request, response, next) => {
  if (!supabaseAdmin) return response.status(503).json(unavailable);

  const waitMs = startLimiter.take(addressOf(request));
  if (waitMs > 0) {
    const seconds = Math.ceil(waitMs / 1000);
    response.setHeader("Retry-After", String(seconds));
    return response.status(429).json({
      code: "too-many-tests",
      retryAfterSeconds: seconds,
      message: "Too many tests were started from this connection. Wait a few minutes, then try again."
    });
  }

  const parsed = startSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: "That request is not valid." });
  const { studentKey, language } = parsed.data;

  try {
    if (!(await canUseStudentKey(request, studentKey, { writing: true }))) {
      return response.status(401).json({ message: "Sign in again to continue." });
    }

    const notFound = { code: "gone", message: "That test is no longer there, or it is not shared with you." };
    const test = await getTest(request.params.id);
    if (!test) return response.status(404).json(notFound);

    // Only asked about when it matters: a friends-only test someone else made.
    const viewer = (await signedInAccount(request))?.id ?? null;
    const friends =
      test.visibility === "friends" && viewer !== null && viewer !== test.ownerId
        ? await friendIdsOf(viewer)
        : new Set<string>();
    if (!canSeeTest(test, viewer, friends)) return response.status(404).json(notFound);

    const paper = buildPaper(test, await picksOf(bankIdsOf(test.items)), language);
    if (paper.exam.length === 0) {
      return response.status(409).json({
        code: "no-questions",
        message: "None of this test's questions can be sat any more.",
        availableCount: 0
      });
    }

    const settings: TestSettings = {
      subjectId: test.subjectId,
      topicIds: [...new Set(paper.attempt.map((question) => question.topicId))],
      difficultyMode: "custom",
      questionCount: paper.exam.length,
      timeLimitMinutes: test.timeLimitMinutes
    };

    const attempt = await createAttempt({ studentKey, settings, questions: paper.attempt, studentTestId: test.id });

    const mock: MockTest = {
      id: attempt.id,
      title: test.title,
      studentTestId: test.id,
      settings,
      questions: paper.exam,
      createdAt: attempt.createdAt
    };

    // `short` when bank picks had left the bank since the test was made.
    response.json({ test: mock, short: paper.exam.length < test.items.length, requestedCount: test.items.length });
  } catch (error) {
    next(error);
  }
});
