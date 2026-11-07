import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { PassageDraft, QuestionDraft } from "@grade9/shared";
import {
  decodeAnswerSet,
  markLimits,
  paperYearLimits,
  passageLimits,
  questionTypes,
  repeatedOption,
  siteLanguages,
  subjects,
  testScopeLimits
} from "@grade9/shared";
import { bearerToken } from "../lib/bearerToken";
import { env, storageMode, writtenMarkingEnabled } from "../lib/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { login, logout, requireAdmin } from "../modules/admin/adminAuth";
import {
  bankSummary,
  createQuestions,
  deleteQuestion,
  listQuestions,
  saveImportedQuestions,
  updateQuestion
} from "../repositories/questionRepository";
import {
  createPassage,
  deletePassage,
  getPassage,
  listPassages,
  passagesByRef,
  savePassagesByRef,
  updatePassage
} from "../repositories/passageRepository";
import { createLoginLimiter } from "../services/loginLimiter";
import { checkPictureLink, originOf, quotedLink, type PictureLinkProblem, type PictureLinkRules } from "../services/pictureLinks";
import { photoTypeOf } from "../services/profilePhotos";
import {
  importPassagesFromCsv,
  importQuestionsFromCsv,
  looksLikePassageSheet,
  planImport
} from "../services/questionImport";
import { translationProblems } from "../services/questionTranslations";

export const adminRouter = Router();

/**
 * The picture links this API takes (see pictureLinks.ts): any https:// link,
 * any link into its own Supabase project's storage, and a picture kept in the
 * question only while there is no storage, which is when the upload below
 * gives those back.
 */
const pictureLinks: PictureLinkRules = {
  supabaseOrigin: originOf(env.supabaseUrl),
  allowInlinePictures: storageMode === "memory"
};

function pictureLinkMessage(problem: PictureLinkProblem, link: string): string {
  return problem === "inline-with-storage"
    ? "This picture is kept inside the question (a data: link), which only works while no Supabase storage is connected. Upload the picture in the admin form instead."
    : `The picture link "${quotedLink(link)}" is not a full link starting with https://, so students would see a broken picture. Upload the picture in the admin form instead.`;
}

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
    // Trimmed like the answer below, and as the form and the import trim
    // them. Untrimmed, a topic of spaces became a blank topic chip in the
    // student builder, and a question or option of spaces was served blank.
    // No longer than generating a test accepts (testScopeLimits): a longer
    // topic saved here could never be drawn into a paper.
    topicId: z
      .string()
      .trim()
      .min(1, "A topic is required")
      .max(testScopeLimits.maxIdLength, `A topic can be at most ${testScopeLimits.maxIdLength} characters`),
    difficulty: z.enum(["easy", "medium", "hard"]),
    type: z.enum(questionTypes as [QuestionDraft["type"], ...QuestionDraft["type"][]]),
    prompt: z.string().trim().min(1, "Question text is required"),
    options: z.array(z.string().trim().min(1, "An option cannot be empty")).default([]),
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
    // Shown to students as it is and, for a written question, fetched for the
    // AI marker, so only a link to a picture is taken, and it is saved written
    // out in full, as it is read (see pictureLinks.ts). Blank is no picture.
    imageUrl: z
      .string()
      .trim()
      .nullable()
      .default(null)
      .transform((link, context) => {
        if (!link) return null;
        const checked = checkPictureLink(link, pictureLinks);
        if ("problem" in checked) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: pictureLinkMessage(checked.problem, link) });
          return z.NEVER;
        }
        return checked.link;
      }),
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
    translations: z.record(z.enum(siteLanguages), translationSchema).default({}),
    // The reading passage the question is about (0017). Whether it exists is
    // checked by the route, which can read the bank.
    passageId: z.string().uuid("That passage is not one in the bank.").nullable().default(null),
    passageOrder: z.number().int().min(1).max(1000).nullable().default(null)
  })
  .superRefine((value, context) => {
    if (value.type === "multiple-select") {
      if (value.options.length < 2) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: "Questions with more than one right answer need at least two options."
        });
        return;
      }
      const repeated = repeatedOption(value.options);
      if (repeated !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: `Two options are the same ("${repeated}"). Each option has to be different.`
        });
        return;
      }
      const chosen = decodeAnswerSet(value.correctAnswer);
      if (chosen.length === 0 || !chosen.every((option) => value.options.includes(option))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctAnswer"],
          message: "Every right answer must be one of the options."
        });
        return;
      }
    }

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
 * of ours, which the form's list never offers, a repeated option, or a picture
 * link that is not one) is put in the message itself.
 */
function invalidQuestion(error: z.ZodError) {
  const visibleIssue = error.issues.find(
    (issue) =>
      issue.path[0] === "translations" ||
      issue.path[0] === "passageId" ||
      issue.path[0] === "correctAnswer" ||
      issue.path[0] === "subjectId" ||
      issue.path[0] === "options" ||
      issue.path[0] === "imageUrl"
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

/**
 * What is wrong with the passage a question points at, or null: it has to be
 * in the bank, and for the question's own subject, since the passage is
 * shown beside the question in that subject's paper.
 */
async function passageProblem(draft: Pick<QuestionDraft, "passageId" | "subjectId">): Promise<string | null> {
  if (draft.passageId === null) return null;
  const passage = await getPassage(draft.passageId);
  if (!passage) return "That question is not valid yet. Its passage has been deleted. Choose another, or none.";
  if (passage.subjectId !== draft.subjectId) {
    return "That question is not valid yet. Its passage belongs to another subject. Choose one for this subject, or none.";
  }
  return null;
}

adminRouter.post("/questions", requireAdmin, async (request, response, next) => {
  const parsed = questionSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json(invalidQuestion(parsed.error));
  }

  try {
    const problem = await passageProblem(parsed.data);
    if (problem) return response.status(400).json({ message: problem });

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
    const problem = await passageProblem(parsed.data);
    if (problem) return response.status(400).json({ message: problem });

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

// ---------------------------------------------------------------------------
// Passages (0017)
// ---------------------------------------------------------------------------

const passageSchema = z.object({
  subjectId: z
    .string({ required_error: unknownSubject, invalid_type_error: unknownSubject })
    .refine((id) => subjectIds.includes(id), { message: unknownSubject }),
  title: z
    .string()
    .trim()
    .min(1, "Give the passage a title.")
    .max(passageLimits.titleMax, `A title can be at most ${passageLimits.titleMax} characters.`),
  // Only the ends are trimmed: the line breaks inside are the paragraphs.
  body: z
    .string()
    .trim()
    .min(1, "Type or paste the text.")
    .max(passageLimits.bodyMax, `A passage can be at most ${passageLimits.bodyMax} characters.`),
  paperYear: z.number().int().min(paperYearLimits.min).max(paperYearLimits.max).nullable().default(null),
  source: z
    .string()
    .trim()
    .nullable()
    .default(null)
    .transform((value) => value || null)
});

function invalidPassage(error: z.ZodError) {
  return { message: `That passage is not valid yet. ${error.issues[0]?.message ?? ""}`.trim(), issues: error.flatten() };
}

adminRouter.get("/passages", requireAdmin, async (request, response, next) => {
  try {
    const subjectId = typeof request.query.subject === "string" && request.query.subject ? request.query.subject : undefined;
    const [passages, questions] = await Promise.all([listPassages({ subjectId }), listQuestions({ subjectId })]);

    // How many questions each one has, so the list says which are in use.
    const questionCounts: Record<string, number> = {};
    for (const question of questions) {
      if (question.passageId) questionCounts[question.passageId] = (questionCounts[question.passageId] ?? 0) + 1;
    }

    response.json({ passages, questionCounts });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/passages", requireAdmin, async (request, response, next) => {
  const parsed = passageSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(invalidPassage(parsed.error));

  try {
    const passage = await createPassage(parsed.data as PassageDraft);
    response.status(201).json({ passage });
  } catch (error) {
    next(error);
  }
});

adminRouter.put("/passages/:id", requireAdmin, async (request, response, next) => {
  const parsed = passageSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(invalidPassage(parsed.error));

  try {
    const existing = await getPassage(request.params.id);
    if (!existing) return response.status(404).json({ message: "Passage not found." });

    // Its questions are shown beside it in their own subject's paper.
    if (existing.subjectId !== parsed.data.subjectId) {
      const linked = (await listQuestions({ subjectId: existing.subjectId })).some(
        (question) => question.passageId === existing.id
      );
      if (linked) {
        return response.status(400).json({
          message: "That passage is not valid yet. Questions are linked to it, so its subject cannot change. Take them off it first."
        });
      }
    }

    const passage = await updatePassage(request.params.id, parsed.data as PassageDraft);
    if (!passage) return response.status(404).json({ message: "Passage not found." });
    response.json({ passage });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/passages/:id", requireAdmin, async (request, response, next) => {
  try {
    const deleted = await deletePassage(request.params.id);
    if (!deleted) return response.status(404).json({ message: "Passage not found." });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/**
 * Saves the passages of a Reading texts sheet and builds the import response.
 *
 * A passage the bank already holds under the same sheet id is updated, so the
 * sheet can be fixed and sent again. When the sheet names no subject, the
 * subject of the passage already in the bank is kept rather than guessed again.
 */
async function importPassageSheet(csv: string) {
  const sheet = importPassagesFromCsv(csv);
  const existing = await passagesByRef(sheet.passages.map((item) => item.externalRef));
  const saved = await savePassagesByRef(
    sheet.passages.map((item) => ({
      externalRef: item.externalRef,
      draft: {
        ...item.draft,
        subjectId: item.subjectGiven ? item.draft.subjectId : (existing.get(item.externalRef)?.subjectId ?? item.draft.subjectId)
      }
    }))
  );

  return {
    importedCount: 0,
    updatedCount: 0,
    skippedCount: sheet.headerProblem ? 0 : sheet.errors.length,
    errors: sheet.errors,
    duplicateRows: [] as number[],
    draftRows: [] as Array<{ row: number; reason: string }>,
    passagesCreated: saved.created,
    passagesUpdated: saved.updated,
    questions: []
  };
}

/**
 * Bulk import from a spreadsheet export.
 *
 * Rows that fail validation are reported back with their spreadsheet row number
 * and skipped; the valid rows still import. Partial success beats rejecting a
 * fifty-row paste over one bad cell.
 *
 * Rows already in the bank are left out and listed, so the whole sheet can be
 * pasted again once the bad rows are fixed without the good ones going in twice.
 * A row that carries its paper's date, variant and question number is not left
 * out but updated, which is how a sheet is corrected and sent again.
 *
 * With `keepDrafts` a row that is not answerable yet (no options, a key the
 * paper does not publish, a passage not in the bank) is saved as a draft, kept
 * out of tests, and listed in `draftRows` with the reason, instead of being
 * skipped. The Reading texts sheet can be dropped on this same endpoint: it is
 * recognised by its header and imported as passages.
 */
adminRouter.post("/questions/import", requireAdmin, async (request, response, next) => {
  const parsed = z.object({ csv: z.string().min(1), keepDrafts: z.boolean().optional() }).safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({ message: "Paste some CSV rows first." });
  }

  try {
    if (looksLikePassageSheet(parsed.data.csv)) {
      return response.json(await importPassageSheet(parsed.data.csv));
    }

    const keepDrafts = parsed.data.keepDrafts === true;
    const imported = importQuestionsFromCsv(parsed.data.csv, { pictureLinks, keepDrafts });

    // The passages the rows carry the text of go in first, so the questions
    // that point at them can be linked; the rest are looked up in the bank.
    const saved = await savePassagesByRef(imported.passages.map(({ externalRef, draft }) => ({ externalRef, draft })));
    const known = new Map(saved.byRef);
    const wanted = imported.rows.flatMap((row) => (row.passageRef !== null && !known.has(row.passageRef) ? [row.passageRef] : []));
    for (const [ref, passage] of await passagesByRef(wanted)) known.set(ref, passage);

    const plan =
      imported.drafts.length > 0
        ? planImport(imported, { bank: await listQuestions(), passages: known, keepDrafts })
        : { items: [], duplicateRows: [] as number[], errors: [] };
    const result = await saveImportedQuestions(
      plan.items.map(({ draft, status, subtopic, externalRef }) => ({ draft, status, subtopic, externalRef }))
    );
    const errors = [...imported.errors, ...plan.errors].sort((a, b) => a.row - b.row);

    response.json({
      importedCount: result.created.length,
      updatedCount: result.updated.length,
      // A sheet whose header is the problem has no row to skip: "skipped 1"
      // beside "there are no question rows" contradicted itself.
      skippedCount: imported.headerProblem ? 0 : errors.length,
      errors,
      duplicateRows: plan.duplicateRows,
      draftRows: plan.items.flatMap((item) => (item.reason === null ? [] : [{ row: item.row, reason: item.reason }])),
      passagesCreated: saved.created,
      passagesUpdated: saved.updated,
      questions: [...result.created, ...result.updated]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Bulk import of reading passages from a Reading texts sheet (ID, title, text),
 * keyed by the sheet's id so sending it again updates the passages. Questions
 * link to them by the same id, from the questions import.
 */
adminRouter.post("/passages/import", requireAdmin, async (request, response, next) => {
  const parsed = z.object({ csv: z.string().min(1) }).safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({ message: "Paste some CSV rows first." });
  }

  try {
    if (!looksLikePassageSheet(parsed.data.csv)) {
      return response.status(400).json({
        message: "That does not look like a Reading texts sheet. It needs an id column (ID текста or passage_id) and a text column, and no question column."
      });
    }
    response.json(await importPassageSheet(parsed.data.csv));
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
