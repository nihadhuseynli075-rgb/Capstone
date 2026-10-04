import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { QuestionDraft } from "@grade9/shared";
import { markLimits, paperYearLimits, repeatedOption, siteLanguages, subjects } from "@grade9/shared";
import { bearerToken } from "../lib/bearerToken";
import { env, storageMode, writtenMarkingEnabled } from "../lib/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { login, logout, requireAdmin } from "../modules/admin/adminAuth";
import {
  bankSummary,
  createQuestions,
  deleteQuestion,
  listQuestions,
  updateQuestion
} from "../repositories/questionRepository";
import { createLoginLimiter } from "../services/loginLimiter";
import { photoTypeOf } from "../services/profilePhotos";
import { importQuestionsFromCsv } from "../services/questionImport";
import { translationProblems } from "../services/questionTranslations";

export const adminRouter = Router();

/**
 * One language's version of a question. Whether it fits the question it sits on
 * (same number of options, a subject that follows the site language) depends on
 * the rest of the question, so that is checked below with the question in hand.
 *
 * Strict, so a misspelt field is refused instead of being saved and never read.
 */
const translationSchema = z
  .object({
    prompt: z.string().trim().min(1, "A translation needs the question text"),
    options: z.array(z.string().trim().min(1, "A translated option cannot be empty")).optional(),
    explanation: z.string().optional(),
    correctAnswer: z.string().trim().min(1).optional()
  })
  .strict();

const subjectIds = subjects.map((subject) => subject.id);
const unknownSubject = `The subject must be one of: ${subjectIds.join(", ")}.`;

const questionSchema = z
  .object({
    // The subjects are a fixed list, and the student's builder makes a chip for
    // every subject the bank holds a question for. Any other value, even a
    // typo, put a new subject in front of students that no filter in the admin
    // dashboard could then find.
    subjectId: z
      .string({ required_error: unknownSubject, invalid_type_error: unknownSubject })
      .refine((id) => subjectIds.includes(id), { message: unknownSubject }),
    topicId: z.string().min(1),
    difficulty: z.enum(["easy", "medium", "hard"]),
    type: z.enum(["multiple-choice", "short-answer", "open-ended"]),
    prompt: z.string().min(1, "Question text is required"),
    options: z.array(z.string().min(1)).default([]),
    // For an open-ended question this is the marking guide the AI marker
    // works from.
    correctAnswer: z.string().trim().min(1, "A correct answer (or, for a written question, a marking guide) is required"),
    // Defaults to one so a sheet or a form without a marks column still works.
    marks: z
      .number()
      .int()
      .min(markLimits.min, "A question must be worth at least one mark")
      .max(markLimits.max)
      .default(markLimits.min),
    explanation: z.string().default(""),
    imageUrl: z.string().nullable().default(null),
    paperYear: z
      .number()
      .int()
      .min(paperYearLimits.min)
      .max(paperYearLimits.max)
      .nullable()
      .default(null),
    source: z.string().nullable().default(null),
    // Keyed by site language. Defaults to none so a form or sheet that knows
    // nothing about translations still works.
    translations: z.record(z.enum(siteLanguages), translationSchema).default({})
  })
  .superRefine((value, context) => {
    if (value.type === "multiple-choice") {
      if (value.options.length < 2) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: "Multiple choice questions need at least two options."
        });
        return;
      }
      // Marking compares the text picked, so both copies would be marked the
      // same way: two right answers, or two wrong ones.
      const repeated = repeatedOption(value.options);
      if (repeated !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: `Two options are the same ("${repeated}"). Each option has to be different.`
        });
        return;
      }
      if (!value.options.includes(value.correctAnswer)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctAnswer"],
          message: "The correct answer must be one of the options."
        });
        return;
      }
    }

    // Last, because they are measured against the options and answer above.
    for (const problem of translationProblems(value)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: problem.path, message: problem.message });
    }
  });

/**
 * The refusal for a question that does not pass the schema.
 *
 * The browser shows the message and not the issues, so a problem the form
 * cannot show beside the field (the translations, a subject that is not one
 * of ours, which the form's list never offers, or a repeated option) is put
 * in the message itself.
 */
function invalidQuestion(error: z.ZodError) {
  const visibleIssue = error.issues.find(
    (issue) => issue.path[0] === "translations" || issue.path[0] === "subjectId" || issue.path[0] === "options"
  );

  return {
    message: visibleIssue
      ? `That question is not valid yet. ${visibleIssue.message}`
      : "That question is not valid yet.",
    issues: error.flatten()
  };
}

/**
 * Ten wrong passwords in fifteen minutes shut the address out for fifteen.
 *
 * Counted per address the request came from. Behind a proxy that is the
 * proxy's, so everyone shares one count, which is still the right side to err
 * on for a dashboard guarded by one shared password.
 */
const loginLimiter = createLoginLimiter({
  maxFailures: 10,
  windowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000
});

adminRouter.post("/login", (request, response) => {
  const parsed = z.object({ password: z.string() }).safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({ message: "Password is required." });
  }

  const address = request.ip ?? request.socket.remoteAddress ?? "unknown";

  // Checked before the password, so a right one is refused too while the
  // address is shut out: otherwise the pause would only slow guessing, not stop it.
  const waitMs = loginLimiter.waitFor(address);
  if (waitMs > 0) {
    const seconds = Math.ceil(waitMs / 1000);
    const minutes = Math.ceil(seconds / 60);
    response.setHeader("Retry-After", String(seconds));
    return response.status(429).json({
      code: "too-many-attempts",
      retryAfterSeconds: seconds,
      message: `Too many wrong passwords. Wait ${minutes} minute${minutes === 1 ? "" : "s"}, then try again.`
    });
  }

  const token = login(parsed.data.password);
  if (!token) {
    loginLimiter.recordFailure(address);
    return response.status(401).json({ message: "That password is not correct." });
  }

  loginLimiter.recordSuccess(address);

  return response.json({
    token,
    storageMode,
    usingDefaultPassword: env.adminPasswordIsDefault
  });
});

adminRouter.post("/logout", requireAdmin, (request, response) => {
  logout(bearerToken(request) ?? "");
  response.json({ ok: true });
});

adminRouter.get("/questions", requireAdmin, async (request, response, next) => {
  try {
    const [questions, bank] = await Promise.all([
      listQuestions({
        subjectId: typeof request.query.subject === "string" ? request.query.subject : undefined,
        difficulty:
          request.query.difficulty === "easy" ||
          request.query.difficulty === "medium" ||
          request.query.difficulty === "hard"
            ? request.query.difficulty
            : undefined,
        // Spaces at either end are not part of what is looked for: pasted
        // text often carries one, and " radius" then found nothing at all.
        search: typeof request.query.search === "string" ? request.query.search.trim() || undefined : undefined
      }),
      bankSummary()
    ]);

    // Sent on every listing, not only on the login reply. The admin token
    // outlives a page reload, so a dashboard that only learned this at sign-in
    // dropped the warning for exactly the person who never signs in again.
    response.json({
      questions,
      // The whole bank, which the filters above do not touch.
      bank,
      storageMode,
      usingDefaultPassword: env.adminPasswordIsDefault,
      // Without the AI marker, written questions are kept out of tests.
      writtenMarking: writtenMarkingEnabled
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/questions", requireAdmin, async (request, response, next) => {
  const parsed = questionSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json(invalidQuestion(parsed.error));
  }

  try {
    const [question] = await createQuestions([parsed.data as QuestionDraft]);
    response.status(201).json({ question });
  } catch (error) {
    next(error);
  }
});

adminRouter.put("/questions/:id", requireAdmin, async (request, response, next) => {
  const parsed = questionSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json(invalidQuestion(parsed.error));
  }

  try {
    const question = await updateQuestion(request.params.id, parsed.data as QuestionDraft);
    if (!question) {
      return response.status(404).json({ message: "Question not found." });
    }
    response.json({ question });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/questions/:id", requireAdmin, async (request, response, next) => {
  try {
    const deleted = await deleteQuestion(request.params.id);
    if (!deleted) {
      return response.status(404).json({ message: "Question not found." });
    }
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/**
 * Bulk import from a spreadsheet export.
 *
 * Rows that fail validation are reported back with their spreadsheet row number
 * and skipped; the valid rows still import. Partial success beats rejecting a
 * fifty-row paste over one bad cell.
 */
adminRouter.post("/questions/import", requireAdmin, async (request, response, next) => {
  const parsed = z.object({ csv: z.string().min(1) }).safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({ message: "Paste some CSV rows first." });
  }

  try {
    const { drafts, errors } = importQuestionsFromCsv(parsed.data.csv);
    const created = drafts.length > 0 ? await createQuestions(drafts) : [];

    response.json({
      importedCount: created.length,
      skippedCount: errors.length,
      errors,
      questions: created
    });
  } catch (error) {
    next(error);
  }
});

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * Question diagram upload.
 *
 * With Supabase configured the file lands in the storage bucket and the public
 * URL is stored on the question. Without it, the image is echoed back as a data
 * URL so the flow is still testable locally.
 */
adminRouter.post("/questions/image", requireAdmin, async (request, response, next) => {
  const parsed = z
    .object({
      fileName: z.string().min(1),
      contentType: z.string().regex(/^image\//, "Only image files are supported."),
      dataBase64: z.string().min(1)
    })
    .safeParse(request.body);

  if (!parsed.success) {
    // The first problem, in words: "That upload is not valid." told the person
    // nothing, when the schema already says "Only image files are supported."
    return response.status(400).json({
      message: parsed.error.issues[0]?.message ?? "That upload is not valid.",
      issues: parsed.error.flatten()
    });
  }

  const buffer = Buffer.from(parsed.data.dataBase64, "base64");

  if (buffer.byteLength === 0) {
    return response.status(400).json({ message: "The image file was empty." });
  }

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return response.status(413).json({ message: "Images must be 2 MB or smaller." });
  }

  // What the file really is, from its first bytes. The name and the type are
  // whatever the browser said: a text file renamed .png was stored and kept,
  // and showed as a broken picture. Only real PNG, JPG and WebP files are
  // taken, and stored as what they are (see photoTypeOf).
  const type = photoTypeOf(buffer);

  if (!type) {
    return response.status(400).json({
      message: "That file is not a PNG, JPG or WebP picture, whatever its name says. Choose an image file."
    });
  }

  if (!supabaseAdmin) {
    return response.json({
      imageUrl: `data:${type.contentType};base64,${parsed.data.dataBase64}`,
      storageMode
    });
  }

  try {
    const path = `${randomUUID()}.${type.extension}`;

    const { error } = await supabaseAdmin.storage
      .from(env.questionImageBucket)
      .upload(path, buffer, { contentType: type.contentType, upsert: false });

    if (error) throw new Error(error.message);

    const { data } = supabaseAdmin.storage.from(env.questionImageBucket).getPublicUrl(path);

    response.json({ imageUrl: data.publicUrl, storageMode });
  } catch (error) {
    next(error);
  }
});
