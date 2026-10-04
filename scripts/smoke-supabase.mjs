/**
 * The API's Supabase code paths, end to end, with no Supabase project.
 *
 *   npm run smoke:supabase
 *
 * Starts the local stand-in in scripts/supabase-standin.mjs, starts the API
 * pointed at it, runs the ordinary smoke test through it, then checks what only
 * exists in Supabase mode: account keys backed by tokens, who may move whose
 * history, two submissions of one paper at once, recovering from writes that
 * fail halfway, and the profile page's reads, renames, usernames, email and
 * password changes, photos and deletion.
 *
 * The stand-in imitates PostgREST and GoTrue closely enough to catch the API
 * sending the wrong request or mishandling an error. It is not a real project:
 * row level security and the migration SQL are only proven against one.
 */

import { spawn } from "node:child_process";
import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createChecks, request } from "./smoke-kit.mjs";
import { startStandin } from "./supabase-standin.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "capstone123";

const { check, section, counts } = createChecks();

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(apiUrl, api) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (api.exitCode !== null) throw new Error(`the API exited early with code ${api.exitCode}`);
    try {
      const health = await request(apiUrl, "/health");
      if (health.status === 200) return health.body;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("the API did not come up within 30 seconds");
}

function runSharedSmoke(apiUrl) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "smoke-test.mjs")], {
      cwd: root,
      env: { ...process.env, SMOKE_API_URL: apiUrl, ADMIN_PASSWORD },
      stdio: "inherit"
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/**
 * A stand-in for the Claude API, so written answers are marked end to end
 * without calling (or paying for) the real one. The API finds it through
 * ANTHROPIC_BASE_URL, which the SDK reads. It gives every answer the score
 * named in it ("SCORE:2"), and fails with a 500 for any answer saying
 * "MARKER DOWN", which the SDK retries and then gives up on.
 */
async function startFakeMarker() {
  const requests = [];
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      const body = JSON.parse(raw || "{}");
      requests.push({ path: request.url, headers: request.headers, body });
      const text = body.messages?.[0]?.content?.at(-1)?.text ?? "";
      const answer = /<student_answer>\n([\s\S]*?)\n<\/student_answer>/.exec(text)?.[1] ?? "";

      if (answer.includes("MARKER DOWN")) {
        response.writeHead(500, { "content-type": "application/json" });
        return response.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "down" } }));
      }

      const score = Number(/SCORE:(\d+)/.exec(answer)?.[1] ?? 0);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: `msg_fake_${requests.length}`,
          type: "message",
          role: "assistant",
          model: body.model,
          content: [{ type: "text", text: JSON.stringify({ score, feedback: `Fake feedback for a ${score}.` }) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 20 }
        })
      );
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}

async function main() {
  const standin = await startStandin({ port: 0 });
  const marker = await startFakeMarker();
  const apiPort = await freePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const apiLog = [];

  const api = spawn(process.execPath, ["--import", "tsx", path.join("apps", "api", "src", "server.ts")], {
    cwd: root,
    env: {
      ...process.env,
      SUPABASE_URL: standin.url,
      SUPABASE_SERVICE_ROLE_KEY: "standin-service-role-key",
      API_PORT: String(apiPort),
      ADMIN_PASSWORD,
      ANTHROPIC_API_KEY: "smoke-fake-key",
      ANTHROPIC_BASE_URL: marker.url
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  api.stdout.on("data", (chunk) => apiLog.push(chunk.toString()));
  api.stderr.on("data", (chunk) => apiLog.push(chunk.toString()));
  const stopApi = () => {
    if (api.exitCode === null) api.kill();
  };
  process.on("exit", stopApi);

  const call = (route, options) => request(apiUrl, route, options);
  const control = (route, body) =>
    request(standin.url, `/__standin/${route}`, { method: body === undefined ? "GET" : "POST", body });
  const rows = async (table, query = "") => (await control(`rows/${table}${query}`)).body.rows ?? [];

  try {
    console.log(`ExamPeak Supabase-mode smoke test: stand-in ${standin.url}, API ${apiUrl}`);

    section("Storage");
    const health = await waitForHealth(apiUrl, api);
    check("the API is using Supabase storage", health.storageMode === "supabase", JSON.stringify(health));

    section("The shared smoke test, through Supabase storage");
    const sharedExit = await runSharedSmoke(apiUrl);
    check("scripts/smoke-test.mjs passes against Supabase storage", sharedExit === 0, `exit code ${sharedExit}`);

    const login = await call("/api/admin/login", { method: "POST", body: { password: ADMIN_PASSWORD } });
    const adminToken = login.body.token;

    // A topic of its own, so the papers below are drawn from these two
    // questions and nothing the shared smoke test left in the bank.
    const topicId = `standin-${Date.now()}`;
    const bankIds = [];
    for (const [prompt, options, correctAnswer] of [
      ["What is 3 x 3?", ["6", "9", "12"], "9"],
      ["What is 10 - 4?", ["4", "6", "14"], "6"]
    ]) {
      const created = await call("/api/admin/questions", {
        method: "POST",
        token: adminToken,
        body: {
          subjectId: "math",
          topicId,
          difficulty: "easy",
          type: "multiple-choice",
          prompt,
          options,
          correctAnswer,
          explanation: ""
        }
      });
      bankIds.push(created.body.question?.id);
    }
    check("the stand-in bank takes new questions", bankIds.every((id) => typeof id === "string"));

    section("Unfinished questions stay out of tests");
    // Papers are loaded from the SQL editor in stages: the questions first, the
    // options and pictures later. Its own topic, so the papers below are not
    // affected by what happens to it here.
    const stagedTopic = `${topicId}-staged`;
    const staged = await call("/api/admin/questions", {
      method: "POST",
      token: adminToken,
      body: {
        subjectId: "math",
        topicId: stagedTopic,
        difficulty: "easy",
        type: "multiple-choice",
        prompt: "What is 2 + 5?",
        options: ["6", "7", "8"],
        correctAnswer: "7",
        explanation: ""
      }
    });
    const stagedId = staged.body.question?.id;
    check("a question saved through the admin form is ready", staged.body.question?.status === "ready", JSON.stringify(staged.body));

    const stagedCount = async () => {
      const catalog = await call("/api/catalog");
      const math = (catalog.body.subjects ?? []).find((subject) => subject.id === "math");
      return math?.topics.find((topic) => topic.id === stagedTopic)?.total ?? 0;
    };
    const generateStaged = () =>
      call("/api/tests/generate", {
        method: "POST",
        body: {
          studentKey: randomUUID(),
          subjectId: "math",
          topicIds: [stagedTopic],
          difficultyMode: "custom",
          questionCount: 5,
          timeLimitMinutes: 30
        }
      });

    check("a ready question is counted in the catalog", (await stagedCount()) === 1);

    // What a paper loaded without its options looks like.
    const drafted = await request(standin.url, `/__standin/rows/questions/${stagedId}`, {
      method: "PATCH",
      body: { status: "draft", options: [], correct_answer: "" }
    });
    check("a question can be held back as a draft", drafted.status === 200, JSON.stringify(drafted.body));
    check("a draft is not counted in the catalog", (await stagedCount()) === 0);

    const draftTest = await generateStaged();
    check(
      "a draft is never put in a test",
      draftTest.status === 409 && !(draftTest.body.test?.questions ?? []).some((question) => question.id === stagedId),
      `got ${draftTest.status}: ${JSON.stringify(draftTest.body)}`
    );

    const adminList = (await call("/api/admin/questions", { token: adminToken })).body.questions ?? [];
    check(
      "the admin list still shows the draft, flagged",
      adminList.some((question) => question.id === stagedId && question.status === "draft"),
      JSON.stringify(adminList.find((question) => question.id === stagedId))
    );

    const pictureWait = await request(standin.url, `/__standin/rows/questions/${stagedId}`, {
      method: "PATCH",
      body: { status: "image-pending" }
    });
    check("a question can wait for its picture", pictureWait.status === 200, JSON.stringify(pictureWait.body));
    check("a question waiting for its picture is not counted either", (await stagedCount()) === 0);

    const readyTooSoon = await request(standin.url, `/__standin/rows/questions/${stagedId}`, {
      method: "PATCH",
      body: { status: "ready" }
    });
    check(
      "the database will not mark a question with no answer ready",
      readyTooSoon.status >= 400 && JSON.stringify(readyTooSoon.body).includes("questions_ready_is_complete"),
      `got ${readyTooSoon.status}: ${JSON.stringify(readyTooSoon.body)}`
    );

    const completeStaged = (overrides = {}) =>
      call(`/api/admin/questions/${stagedId}`, {
        method: "PUT",
        token: adminToken,
        body: {
          subjectId: "math",
          topicId: stagedTopic,
          difficulty: "easy",
          type: "multiple-choice",
          prompt: "What is 2 + 5?",
          options: ["6", "7", "8"],
          correctAnswer: "7",
          explanation: "",
          ...overrides
        }
      });

    // The form asks for the answer, not for a picture, so filling the answer
    // in used to mark the question ready and send it out without its diagram.
    const stillWaiting = await completeStaged();
    check(
      "saving it through the form without its picture keeps it waiting for one",
      stillWaiting.status === 200 && stillWaiting.body.question?.status === "image-pending",
      JSON.stringify(stillWaiting.body)
    );
    check("so it is still not counted", (await stagedCount()) === 0);
    const waitingTest = await generateStaged();
    check(
      "and still never put in a test",
      waitingTest.status === 409 && !(waitingTest.body.test?.questions ?? []).some((question) => question.id === stagedId),
      `got ${waitingTest.status}: ${JSON.stringify(waitingTest.body)}`
    );

    // Adding the picture through the admin form is what finishes it.
    const finished = await completeStaged({ imageUrl: "https://example.test/diagram.png" });
    check("saving it with its picture makes it ready", finished.body.question?.status === "ready", JSON.stringify(finished.body));
    check("once ready it is counted again", (await stagedCount()) === 1);

    // A draft has its options and answer missing, and saving it complete
    // through the form is what finishes it, picture or not.
    await request(standin.url, `/__standin/rows/questions/${stagedId}`, {
      method: "PATCH",
      body: { status: "draft" }
    });
    const draftFinished = await completeStaged();
    check(
      "a draft saved complete through the form is ready",
      draftFinished.body.question?.status === "ready",
      JSON.stringify(draftFinished.body)
    );

    const readyTest = await generateStaged();
    check(
      "once ready it is put in tests again",
      readyTest.status === 200 && readyTest.body.test?.questions?.some((question) => question.id === stagedId),
      `got ${readyTest.status}: ${JSON.stringify(readyTest.body)}`
    );

    const answerKey = new Map(
      ((await call("/api/admin/questions", { token: adminToken })).body.questions ?? []).map((question) => [
        question.id,
        question.correctAnswer
      ])
    );

    const generate = (studentKey, token, overrides = {}) =>
      call("/api/tests/generate", {
        method: "POST",
        token,
        body: {
          studentKey,
          subjectId: "math",
          topicIds: [topicId],
          difficultyMode: "custom",
          questionCount: 5,
          timeLimitMinutes: 30,
          ...overrides
        }
      });

    const answersFor = (test, pick) =>
      test.questions.map((question, position) => ({
        questionId: question.id,
        position,
        answer: pick(question)
      }));

    const submit = (test, studentKey, answers, token) =>
      call(`/api/tests/${test.id}/submit`, {
        method: "POST",
        token,
        body: { studentKey, answers, timeTakenSeconds: 5 }
      });

    const rightAnswers = (test) => answersFor(test, (question) => answerKey.get(question.id) ?? "");
    const wrongAnswers = (test) => answersFor(test, () => "definitely wrong");

    section("Translations written straight into the table");
    // Questions are loaded from the SQL editor, so what is in the column is
    // whatever was typed there. Here a question is made through the admin API
    // and its translations are then written the way a seed script would.
    const translatedTopic = `${topicId}-translated`;
    const translatedStudent = randomUUID();
    const makeTranslatable = async (subjectId, prompt, translations) => {
      const created = await call("/api/admin/questions", {
        method: "POST",
        token: adminToken,
        body: {
          subjectId,
          topicId: translatedTopic,
          difficulty: "easy",
          type: "multiple-choice",
          prompt,
          options: ["cm", "m", "km"],
          correctAnswer: "m",
          explanation: "Base explanation."
        }
      });
      const id = created.body.question?.id;
      const patched = await request(standin.url, `/__standin/rows/questions/${id}`, {
        method: "PATCH",
        body: { translations }
      });
      return { id, patched };
    };
    const servedIn = (subjectId, language) =>
      generate(translatedStudent, undefined, { subjectId, topicIds: [translatedTopic], language });

    const seeded = await makeTranslatable("math", "How is a road measured?", {
      ru: { prompt: "Как измеряют дорогу?", options: ["см", "м", "км"], explanation: "Объяснение." }
    });
    check("translations can be written into the column", seeded.patched.status === 200, JSON.stringify(seeded.patched.body));

    const inRussian = await servedIn("math", "ru");
    const seededRussian = inRussian.body.test?.questions?.find((question) => question.id === seeded.id);
    check(
      "a seeded Russian translation is served to a Russian student",
      seededRussian?.prompt === "Как измеряют дорогу?" && seededRussian.options[1] === "м",
      JSON.stringify(inRussian.body)
    );
    const seededResult = await submit(inRussian.body.test, translatedStudent, [
      { questionId: seeded.id, position: 0, answer: "м" }
    ]);
    check("and marks the translated option correct", seededResult.body.score === 1, JSON.stringify(seededResult.body));
    const seededAttempt = (await rows("attempt_questions", `?attempt_id=eq.${inRussian.body.test.id}`))[0];
    check(
      "the attempt keeps the translated options and the matching answer",
      seededAttempt?.options?.[1] === "м" && seededAttempt.correct_answer === "м" && seededAttempt.explanation === "Объяснение.",
      JSON.stringify(seededAttempt)
    );

    const notAnObject = await request(standin.url, `/__standin/rows/questions/${seeded.id}`, {
      method: "PATCH",
      body: { translations: [] }
    });
    check("the column only holds a JSON object", notAnObject.status === 400, `got ${notAnObject.status}`);

    // The English question here is the one that must never change language,
    // however much is written onto it.
    const englishQuestion = await makeTranslatable("english", "Which unit is longest?", {
      ru: { prompt: "Какая единица длиннее?", options: ["см", "м", "км"] }
    });
    const englishInRussian = await servedIn("english", "ru");
    const servedEnglish = englishInRussian.body.test?.questions?.find((question) => question.id === englishQuestion.id);
    check(
      "translations seeded onto an English question are never served",
      servedEnglish?.prompt === "Which unit is longest?" && servedEnglish.options[1] === "m",
      JSON.stringify(englishInRussian.body)
    );

    // Anything in the column that does not fit is skipped rather than failing
    // the test, because a student cannot fix a seed script.
    const malformed = await makeTranslatable("math", "Which unit is shortest?", {
      ru: { prompt: "Какая единица короче?", options: ["см", "м"] },
      az: { prompt: "Hansı vahid ən qısadır?", options: [1, 2, 3] },
      en: "not an object"
    });
    for (const language of ["ru", "az", "en"]) {
      const paper = await servedIn("math", language);
      const served = paper.body.test?.questions?.find((question) => question.id === malformed.id);
      check(
        `a translation that does not fit falls back to the question's own text (${language})`,
        paper.status === 200 && served?.prompt === "Which unit is shortest?" && served.options.length === 3,
        JSON.stringify(paper.body)
      );
    }

    // A translation that is only the question text, as a seed may well be.
    const promptOnly = await makeTranslatable("math", "Which unit is the base?", {
      ru: { prompt: "Какая единица основная?" }
    });
    const promptOnlyPaper = await servedIn("math", "ru");
    const promptOnlyServed = promptOnlyPaper.body.test?.questions?.find((question) => question.id === promptOnly.id);
    check(
      "a translation with no options keeps the question's own options",
      promptOnlyServed?.prompt === "Какая единица основная?" && promptOnlyServed.options.join() === "cm,m,km",
      JSON.stringify(promptOnlyServed)
    );

    section("Admin questions in the table: subjects and five options");
    const fiveTopic = `${topicId}-five`;
    const fiveStudent = randomUUID();
    const fiveBody = (overrides = {}) => ({
      subjectId: "math",
      topicId: fiveTopic,
      difficulty: "easy",
      type: "multiple-choice",
      prompt: "Which of these is a prime number?",
      options: ["4", "6", "8", "9", "11"],
      correctAnswer: "11",
      explanation: "11 has no divisors but 1 and itself.",
      translations: {
        ru: { prompt: "Какое из этих чисел простое?", options: ["4", "6", "8", "9", "11"] }
      },
      ...overrides
    });

    const stray = await call("/api/admin/questions", {
      method: "POST",
      token: adminToken,
      body: fiveBody({ subjectId: "chemistry", translations: {} })
    });
    check("a subject that is not one of ours is refused", stray.status === 400, JSON.stringify(stray.body));
    check(
      "and leaves no row in the questions table",
      !(await rows("questions")).some((row) => row.subject_id === "chemistry"),
      "a chemistry row was written"
    );

    // Five options with a Russian translation, the shape the form could not save.
    const fiveCreated = await call("/api/admin/questions", { method: "POST", token: adminToken, body: fiveBody() });
    const fiveId = fiveCreated.body.question?.id;
    check("a five-option question with a Russian translation saves", fiveCreated.status === 201, JSON.stringify(fiveCreated.body));
    const fiveRow = (await rows("questions", `?id=eq.${fiveId}`))[0];
    check(
      "the table holds all five options and all five translated ones",
      fiveRow?.options?.length === 5 && fiveRow.correct_answer === "11" && fiveRow.translations?.ru?.options?.length === 5,
      JSON.stringify(fiveRow)
    );

    const fiveEdited = await call(`/api/admin/questions/${fiveId}`, {
      method: "PUT",
      token: adminToken,
      body: fiveBody({
        options: ["4", "6", "8", "9", "13"],
        correctAnswer: "13",
        translations: {
          ru: { prompt: "Какое из этих чисел простое?", options: ["4", "6", "8", "9", "13"] }
        }
      })
    });
    check("it can be edited, with the fifth option changed", fiveEdited.status === 200, JSON.stringify(fiveEdited.body));
    const fiveEditedRow = (await rows("questions", `?id=eq.${fiveId}`))[0];
    check(
      "the edit reached the table",
      fiveEditedRow?.options?.[4] === "13" && fiveEditedRow.correct_answer === "13" && fiveEditedRow.translations?.ru?.options?.[4] === "13",
      JSON.stringify(fiveEditedRow)
    );

    const strayEdit = await call(`/api/admin/questions/${fiveId}`, {
      method: "PUT",
      token: adminToken,
      body: fiveBody({ subjectId: "chemistry", translations: {} })
    });
    check("moving it to a subject that is not one of ours is refused", strayEdit.status === 400, JSON.stringify(strayEdit.body));
    check(
      "and the row stays in its subject",
      (await rows("questions", `?id=eq.${fiveId}`))[0]?.subject_id === "math"
    );

    for (const language of ["en", "ru"]) {
      const fivePaper = await generate(fiveStudent, undefined, { topicIds: [fiveTopic], language });
      const fiveServed = fivePaper.body.test?.questions?.find((question) => question.id === fiveId);
      check(
        `a student reading in ${language} is served all five options`,
        fivePaper.status === 200 && fiveServed?.options?.length === 5 && fiveServed.options[4] === "13",
        JSON.stringify(fivePaper.body)
      );
    }
    await call(`/api/admin/questions/${fiveId}`, { method: "DELETE", token: adminToken });

    section("Written answers, marked by the AI marker");
    const writtenTopic = `${topicId}-written`;
    const writtenCreated = await call("/api/admin/questions", {
      method: "POST",
      token: adminToken,
      body: {
        subjectId: "russian",
        topicId: writtenTopic,
        difficulty: "hard",
        type: "open-ended",
        prompt: "Объясните значение выражения «зарубить на носу».",
        options: [],
        correctAnswer: "1 балл: запомнить крепко. 1 балл: своими словами. 1 балл: пример из текста.",
        marks: 3,
        explanation: ""
      }
    });
    check("a written question saves", writtenCreated.status === 201, JSON.stringify(writtenCreated.body));

    const writtenKey = randomUUID();
    const writtenPaper = async () =>
      (
        await call("/api/tests/generate", {
          method: "POST",
          body: {
            studentKey: writtenKey,
            subjectId: "russian",
            topicIds: [writtenTopic],
            difficultyMode: "custom",
            questionCount: 5,
            timeLimitMinutes: 30
          }
        })
      ).body.test;
    const submitWritten = (paper, answer) =>
      call(`/api/tests/${paper.id}/submit`, {
        method: "POST",
        body: {
          studentKey: writtenKey,
          timeTakenSeconds: 5,
          answers: [{ questionId: paper.questions[0].id, position: 0, answer }]
        }
      });

    const markedPaper = await writtenPaper();
    check("with a marker, the written question is put in a test", markedPaper?.questions?.[0]?.type === "open-ended");

    const overlong = await submitWritten(markedPaper, "x".repeat(4001));
    check("an answer longer than 4,000 characters is refused before any marking", overlong.status === 400, `got ${overlong.status}`);

    const markedCallsBefore = marker.requests.length;
    const marked = await submitWritten(markedPaper, "Значит запомнить навсегда. SCORE:2");
    const markedReview = marked.body.reviews?.[0];
    check("the paper is marked", marked.status === 200, JSON.stringify(marked.body));
    check("the written answer gets the marks the marker gave", markedReview?.score === 2 && marked.body.totalMarks === 3);
    check("and its feedback", markedReview?.feedback === "Fake feedback for a 2.", JSON.stringify(markedReview));
    check("partial marks are not full marks", markedReview?.isCorrect === false && markedReview?.counted === true);
    check("the score is out of the question's marks", marked.body.percentage === 66.7, String(marked.body.percentage));

    const markerCall = marker.requests[markedCallsBefore];
    check("the marker was asked once", marker.requests.length === markedCallsBefore + 1);
    check(
      "as claude-opus-5-5, with the key",
      markerCall?.body.model === "claude-opus-5-5" && markerCall?.headers["x-api-key"] === "smoke-fake-key"
    );
    check("with the Grade 9 teacher prompt", /Grade 9 teacher/.test(markerCall?.body.system ?? ""));
    check(
      "with refusal fallbacks on",
      markerCall?.body.fallbacks === "default" &&
        /server-side-fallback-2026-07-01/.test(markerCall?.headers["anthropic-beta"] ?? "")
    );
    check(
      "and a structured score to return",
      markerCall?.body.output_config?.format?.type === "json_schema",
      JSON.stringify(markerCall?.body.output_config)
    );

    const [storedWritten] = await rows("attempt_questions", `?attempt_id=eq.${markedPaper.id}`);
    check(
      "the feedback is stored with the answer",
      storedWritten?.feedback === "Fake feedback for a 2." && storedWritten?.score === 2
    );

    const reopened = await call(`/api/tests/attempts/${markedPaper.id}?studentKey=${writtenKey}`);
    const reopenedReview = reopened.body.reviews?.[0];
    check(
      "reopening the result shows the same feedback, without marking again",
      reopenedReview?.feedback === "Fake feedback for a 2." &&
        reopenedReview?.counted === true &&
        marker.requests.length === markedCallsBefore + 1,
      JSON.stringify(reopenedReview)
    );

    const downPaper = await writtenPaper();
    const unmarked = await submitWritten(downPaper, "MARKER DOWN, but a real answer");
    const unmarkedReview = unmarked.body.reviews?.[0];
    check("a paper still submits when the marker is down", unmarked.status === 200, JSON.stringify(unmarked.body));
    check(
      "and the answer is left out of the score, not counted wrong",
      unmarkedReview?.counted === false && unmarked.body.totalMarks === 0 && unmarked.body.incorrectAnswers === 0,
      JSON.stringify(unmarked.body)
    );
    const [storedUnmarked] = await rows("attempt_questions", `?attempt_id=eq.${downPaper.id}`);
    check("it is stored with no score", storedUnmarked?.score === null && storedUnmarked?.is_correct === null);
    const reopenedUnmarked = await call(`/api/tests/attempts/${downPaper.id}?studentKey=${writtenKey}`);
    check("and reopens as not counted", reopenedUnmarked.body.reviews?.[0]?.counted === false);

    const blankPaper = await writtenPaper();
    const callsBeforeBlank = marker.requests.length;
    const blank = await submitWritten(blankPaper, "   ");
    check(
      "a blank written answer scores 0 without asking the marker",
      blank.body.reviews?.[0]?.score === 0 &&
        blank.body.reviews?.[0]?.counted === true &&
        marker.requests.length === callsBeforeBlank,
      JSON.stringify(blank.body.reviews)
    );

    section("Account keys need that account's token");
    const alice = (await control("users", { email: "alice@standin.test", fullName: "Alice" })).body;
    const bob = (await control("users", { email: "bob@standin.test", fullName: "Bob" })).body;
    const aliceId = alice.user.id;
    const aliceToken = alice.session.access_token;
    const bobToken = bob.session.access_token;

    const anonymous = await generate(aliceId);
    check("an account id alone is not enough", anonymous.status === 401, `got ${anonymous.status}`);

    const impostor = await generate(aliceId, bobToken);
    check("another account's token is not enough", impostor.status === 401, `got ${impostor.status}`);

    const aliceTest = await generate(aliceId, aliceToken);
    check("the account's own token works", aliceTest.status === 200, JSON.stringify(aliceTest.body));

    const [aliceRow] = await rows("test_attempts", `?id=eq.${aliceTest.body.test?.id}`);
    check("the attempt is linked to the account", aliceRow?.student_id === aliceId, JSON.stringify(aliceRow));

    const aliceSubmitted = await submit(aliceTest.body.test, aliceId, rightAnswers(aliceTest.body.test), aliceToken);
    check("the account can submit its own paper", aliceSubmitted.status === 200, JSON.stringify(aliceSubmitted.body));

    const aliceHistoryNoToken = await call(`/api/tests/history?studentKey=${aliceId}`);
    check("an account's history is not readable without its token", aliceHistoryNoToken.status === 401, `got ${aliceHistoryNoToken.status}`);

    section("Guest keys are the credential");
    const guestKey = randomUUID();
    const guestTest = await generate(guestKey);
    check("a guest generates without a token", guestTest.status === 200, JSON.stringify(guestTest.body));
    const guestSubmitted = await submit(guestTest.body.test, guestKey, wrongAnswers(guestTest.body.test));
    check("a guest submits without a token", guestSubmitted.status === 200, JSON.stringify(guestSubmitted.body));

    // Not every key is a uuid: the API accepts any 8-100 characters, and the
    // profiles lookup must not turn that into a database error.
    const legacyKey = `legacy-guest-${Date.now()}`;
    const legacyTest = await generate(legacyKey);
    check("a guest key that is not a uuid still generates", legacyTest.status === 200, `got ${legacyTest.status}: ${JSON.stringify(legacyTest.body)}`);
    const legacyHistory = await call(`/api/tests/history?studentKey=${legacyKey}`);
    check("a guest key that is not a uuid still reads history", legacyHistory.status === 200, `got ${legacyHistory.status}: ${JSON.stringify(legacyHistory.body)}`);

    section("Moving guest history onto an account");
    const claimNoToken = await call("/api/tests/claim", {
      method: "POST",
      body: { studentKey: aliceId, guestKey }
    });
    check("claiming needs the account's token", claimNoToken.status === 401, `got ${claimNoToken.status}`);

    const claimWrongToken = await call("/api/tests/claim", {
      method: "POST",
      token: bobToken,
      body: { studentKey: aliceId, guestKey }
    });
    check("claiming onto someone else's account is refused", claimWrongToken.status === 401, `got ${claimWrongToken.status}`);

    // Account ids are not secrets, so one must never work as a guest key.
    const takeover = await call("/api/tests/claim", {
      method: "POST",
      token: bobToken,
      body: { studentKey: bob.user.id, guestKey: aliceId }
    });
    check(
      "an account's history cannot be claimed as if it were a guest's",
      takeover.status === 403,
      `got ${takeover.status}: ${JSON.stringify(takeover.body)}`
    );
    const aliceAfterTakeover = await call(`/api/tests/history?studentKey=${aliceId}`, { token: aliceToken });
    check(
      "the account keeps its history",
      aliceAfterTakeover.body.attempts?.length === 1,
      JSON.stringify(aliceAfterTakeover.body)
    );

    // An account that signed up before the profile trigger has no profile row
    // until it opens its profile page. Its id used to pass as a guest key, so
    // its history could be read with no token and claimed onto anyone's account.
    const noProfile = (await control("users", { email: "noprofile@standin.test", fullName: "No Profile" })).body;
    await request(standin.url, `/__standin/rows/profiles/${noProfile.user.id}`, { method: "DELETE" });
    const noProfileTest = await generate(noProfile.user.id, noProfile.session.access_token);
    check("an account with no profile row can still sit a test", noProfileTest.status === 200, `got ${noProfileTest.status}`);
    const noProfileHistory = await call(`/api/tests/history?studentKey=${noProfile.user.id}`);
    check(
      "an account with no profile row is not readable without its token",
      noProfileHistory.status === 401,
      `got ${noProfileHistory.status}: ${JSON.stringify(noProfileHistory.body).slice(0, 120)}`
    );
    const noProfileTakeover = await call("/api/tests/claim", {
      method: "POST",
      token: bobToken,
      body: { studentKey: bob.user.id, guestKey: noProfile.user.id }
    });
    check(
      "an account with no profile row cannot be claimed as if it were a guest",
      noProfileTakeover.status === 403,
      `got ${noProfileTakeover.status}: ${JSON.stringify(noProfileTakeover.body)}`
    );
    // Unreachable is not the same as "no such account": guessing guest would
    // hand the account's tests out.
    const freshGuest = randomUUID();
    await control("faults", { method: "GET", table: "auth/admin", times: 1, status: 503 });
    const authAdminDown = await call(`/api/tests/history?studentKey=${freshGuest}`);
    check("a new key is not taken as a guest's while accounts cannot be checked", authAdminDown.status === 500, `got ${authAdminDown.status}`);
    const authAdminBack = await call(`/api/tests/history?studentKey=${freshGuest}`);
    check("and the same guest key works once they can", authAdminBack.status === 200, `got ${authAdminBack.status}`);

    // An unfinished paper moves too, so a guest who signs in mid-test can
    // still hand it in as the account.
    const openGuestTest = await generate(guestKey);

    const claimed = await call("/api/tests/claim", {
      method: "POST",
      token: aliceToken,
      body: { studentKey: aliceId, guestKey }
    });
    check("a guest's attempts move onto the account", claimed.status === 200 && claimed.body.claimed === 2, JSON.stringify(claimed.body));

    const movedRows = await rows("test_attempts", `?id=in.(${guestTest.body.test.id},${openGuestTest.body.test.id})`);
    check(
      "moved attempts are linked to the account",
      movedRows.length === 2 && movedRows.every((row) => row.student_key === aliceId && row.student_id === aliceId),
      JSON.stringify(movedRows.map((row) => [row.student_key, row.student_id]))
    );

    const guestHistoryAfter = await call(`/api/tests/history?studentKey=${guestKey}`);
    check("the guest key is left with nothing", guestHistoryAfter.body.attempts?.length === 0, JSON.stringify(guestHistoryAfter.body));

    const replay = await call("/api/tests/claim", {
      method: "POST",
      token: aliceToken,
      body: { studentKey: aliceId, guestKey }
    });
    check("claiming again moves nothing", replay.status === 200 && replay.body.claimed === 0, JSON.stringify(replay.body));

    const finishedAfterClaim = await submit(openGuestTest.body.test, aliceId, rightAnswers(openGuestTest.body.test), aliceToken);
    check("a paper started as a guest is handed in as the account", finishedAfterClaim.status === 200, JSON.stringify(finishedAfterClaim.body));

    section("Sessions that have ended");
    await control("expire-sessions", { userId: aliceId });
    const expired = await call(`/api/tests/history?studentKey=${aliceId}`, { token: aliceToken });
    check("an ended session's token is refused", expired.status === 401, `got ${expired.status}`);

    section("The auth server being down");
    // Not the same as being signed out: telling a signed-in student to sign in
    // again would only send them round in a loop.
    await control("faults", { method: "GET", table: "auth/user", times: 1, status: 503 });
    const authDown = await call(`/api/tests/history?studentKey=${bob.user.id}`, { token: bobToken });
    check(
      "an unreachable auth server is reported as a failure, not as signed out",
      authDown.status === 500 && /Could not check your sign-in/.test(authDown.body.message ?? ""),
      `${authDown.status} ${JSON.stringify(authDown.body)}`
    );
    const authBack = await call(`/api/tests/history?studentKey=${bob.user.id}`, { token: bobToken });
    check("the same token works once it is back", authBack.status === 200, `got ${authBack.status}`);
    check(
      "the auth server's own error text is not passed on",
      authDown.body.message === "Could not check your sign-in just now. Try again in a moment.",
      JSON.stringify(authDown.body)
    );

    section("Database errors stay in the log");
    // The stand-in fails with "injected failure", where a real project would
    // put Postgres or PostgREST wording: table and column names, filter
    // syntax. None of it belongs in a response.
    await control("faults", { method: "GET", table: "test_attempts", times: 1 });
    const historyDown = await call(`/api/tests/history?studentKey=${randomUUID()}`);
    check(
      "a failed read is a 500 with a generic message and a reference",
      historyDown.status === 500 &&
        !/injected failure|Failed to load history/.test(JSON.stringify(historyDown.body)) &&
        typeof historyDown.body.ref === "string",
      `${historyDown.status} ${JSON.stringify(historyDown.body)}`
    );
    await control("faults", { method: "GET", table: "questions", times: 1 });
    const catalogDown = await call("/api/catalog");
    check(
      "so is a failed catalog read",
      catalogDown.status === 500 && !/injected failure/.test(JSON.stringify(catalogDown.body)),
      `${catalogDown.status} ${JSON.stringify(catalogDown.body)}`
    );

    section("Two submissions of the same paper at once");
    const racerKey = randomUUID();
    const raceTest = (await generate(racerKey)).body.test;
    // Every database call takes a while, so both requests are inside the
    // handler, past the "already submitted?" read, before either finishes.
    await control("latency", { ms: 40 });
    const [first, second] = await Promise.all([
      submit(raceTest, racerKey, rightAnswers(raceTest)),
      submit(raceTest, racerKey, wrongAnswers(raceTest))
    ]);
    await control("latency", { ms: 0 });

    const statuses = [first.status, second.status].sort();
    check("exactly one submission is accepted", statuses[0] === 200 && statuses[1] === 409, `statuses ${first.status} and ${second.status}`);
    const loser = first.status === 409 ? first : second;
    check("the other is told the paper was already submitted", loser.body.code === "already-submitted", JSON.stringify(loser.body));

    const winner = first.status === 200 ? first : second;
    const raceReview = await call(`/api/tests/attempts/${raceTest.id}?studentKey=${racerKey}`);
    check("the stored score is the accepted one", raceReview.body.score === winner.body.score, `stored ${raceReview.body.score}, accepted ${winner.body.score}`);
    const storedSum = (raceReview.body.reviews ?? []).reduce((sum, review) => sum + review.score, 0);
    check("the stored answers are the accepted ones", storedSum === winner.body.score, `answers add up to ${storedSum}, score is ${winner.body.score}`);

    section("What marking a submission reads");
    // The previous-best comparison needs headline figures only. Reading every
    // question of every past paper there made each submission slower the more
    // tests the student had sat.
    const readerKey = randomUUID();
    const earlier = (await generate(readerKey)).body.test;
    await submit(earlier, readerKey, rightAnswers(earlier));
    const later = (await generate(readerKey)).body.test;
    const logBefore = (await control("requests")).body.requests.length;
    const laterResult = await submit(later, readerKey, wrongAnswers(later));
    const submitReads = (await control("requests")).body.requests
      .slice(logBefore)
      .filter((entry) => entry.method === "GET" && entry.table === "test_attempts")
      .map((entry) => decodeURIComponent(entry.search));
    check("the submission is marked against the earlier one", laterResult.body.comparison?.previousBest !== null, JSON.stringify(laterResult.body.comparison));
    const historyReads = submitReads.filter((search) => search.includes(`student_key=eq.${readerKey}`));
    check(
      "the previous-best lookup reads no question rows",
      historyReads.length === 1 && !historyReads[0].includes("attempt_questions"),
      JSON.stringify(historyReads)
    );
    const readerHistory = await call(`/api/tests/history?studentKey=${readerKey}`);
    check(
      "the history page still gets its per-topic figures",
      readerHistory.body.attempts?.every((attempt) => Array.isArray(attempt.topicBreakdown) && attempt.topicBreakdown.length > 0),
      JSON.stringify(readerHistory.body.attempts?.map((attempt) => attempt.topicBreakdown))
    );

    section("A save that fails halfway can be retried");
    const retryKey = randomUUID();
    const retryTest = (await generate(retryKey)).body.test;
    // The second answer write fails.
    await control("faults", { method: "PATCH", table: "attempt_questions", skip: 1, times: 1 });
    const broken = await submit(retryTest, retryKey, rightAnswers(retryTest));
    check("the failed save is reported", broken.status === 500, `got ${broken.status}`);
    const [retryRow] = await rows("test_attempts", `?id=eq.${retryTest.id}`);
    check("the paper is not left marked as submitted", retryRow?.submitted_at === null, JSON.stringify(retryRow));
    const retried = await submit(retryTest, retryKey, rightAnswers(retryTest));
    check("sending it again works", retried.status === 200, JSON.stringify(retried.body));
    const retriedReview = await call(`/api/tests/attempts/${retryTest.id}?studentKey=${retryKey}`);
    check(
      "every answer is stored after the retry",
      retriedReview.body.reviews?.every((review) => review.isCorrect === true),
      JSON.stringify(retriedReview.body.reviews?.map((review) => review.studentAnswer))
    );

    const parentKey = randomUUID();
    const parentTest = (await generate(parentKey)).body.test;
    await control("faults", { method: "PATCH", table: "test_attempts", times: 1 });
    const parentBroken = await submit(parentTest, parentKey, rightAnswers(parentTest));
    check("a failed result write is reported", parentBroken.status === 500, `got ${parentBroken.status}`);
    const parentRetried = await submit(parentTest, parentKey, rightAnswers(parentTest));
    check("and can be sent again", parentRetried.status === 200, JSON.stringify(parentRetried.body));

    section("A paper whose questions cannot be saved leaves nothing behind");
    const orphanKey = randomUUID();
    await control("faults", { method: "POST", table: "attempt_questions", times: 1 });
    const orphan = await generate(orphanKey);
    check("the failure is reported", orphan.status === 500, `got ${orphan.status}`);
    const orphanRows = await rows("test_attempts", `?student_key=eq.${orphanKey}`);
    check("no empty attempt is left", orphanRows.length === 0, JSON.stringify(orphanRows));

    section("Time limits are the server's");
    const lateKey = randomUUID();
    const lateTest = (await generate(lateKey, undefined, { timeLimitMinutes: 5 })).body.test;
    await request(standin.url, `/__standin/rows/test_attempts/${lateTest.id}`, {
      method: "PATCH",
      body: { created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }
    });
    const late = await submit(lateTest, lateKey, rightAnswers(lateTest));
    check("a paper past its time is refused", late.status === 409 && late.body.code === "time-expired", `${late.status} ${JSON.stringify(late.body)}`);

    // An untimed paper open for seven hours, with the browser saying so too.
    // That figure was once refused outright, and the answers with it.
    const sevenHours = 7 * 60 * 60;
    const longKey = randomUUID();
    const longTest = (await generate(longKey, undefined, { timeLimitMinutes: null })).body.test;
    await request(standin.url, `/__standin/rows/test_attempts/${longTest.id}`, {
      method: "PATCH",
      body: { created_at: new Date(Date.now() - sevenHours * 1000).toISOString() }
    });
    const long = await call(`/api/tests/${longTest.id}/submit`, {
      method: "POST",
      body: { studentKey: longKey, answers: rightAnswers(longTest), timeTakenSeconds: sevenHours }
    });
    check(
      "an untimed paper open for seven hours is still marked, and keeps its real length",
      long.status === 200 && long.body.timeTakenSeconds >= sevenHours,
      `${long.status} ${JSON.stringify(long.body).slice(0, 300)}`
    );

    section("Profiles need a signed-in account");
    const profileNoToken = await call("/api/profile");
    check("a profile is not readable without a token", profileNoToken.status === 401, `got ${profileNoToken.status}`);
    const profileJunkToken = await call("/api/profile", { token: "not-a-token" });
    check("nor with something that is not a token", profileJunkToken.status === 401, `got ${profileJunkToken.status}`);

    section("Reading a profile");
    const carol = (await control("users", { email: "carol@standin.test", fullName: "Carol" })).body;
    const carolId = carol.user.id;
    const carolToken = carol.session.access_token;
    const carolProfile = await call("/api/profile", { token: carolToken });
    check(
      "the profile made at sign-up is returned",
      carolProfile.status === 200 &&
        carolProfile.body.profile?.id === carolId &&
        carolProfile.body.profile?.fullName === "Carol" &&
        carolProfile.body.profile?.email === "carol@standin.test" &&
        carolProfile.body.profile?.avatarUrl === null &&
        typeof carolProfile.body.profile?.createdAt === "string",
      JSON.stringify(carolProfile.body)
    );

    const googlePhoto = "https://lh3.googleusercontent.com/a/gina-photo";
    const gina = (
      await control("users", {
        email: "gina@standin.test",
        provider: "google",
        metadata: { full_name: "Gina Google", name: "Gina Google", avatar_url: googlePhoto, picture: googlePhoto }
      })
    ).body;
    const ginaToken = gina.session.access_token;
    const ginaProfile = await call("/api/profile", { token: ginaToken });
    check(
      "a Google sign-up starts with its Google name and photo",
      ginaProfile.body.profile?.fullName === "Gina Google" && ginaProfile.body.profile?.avatarUrl === googlePhoto,
      JSON.stringify(ginaProfile.body)
    );

    section("A profile that was never made");
    // As for an account that signed up before the sign-up trigger existed in
    // the project. Its metadata says whatever its sign-up request said.
    const mallory = (
      await control("users", {
        email: "mallory@standin.test",
        metadata: { full_name: "Mallory", avatar_url: "https://tracker.example/pixel.png" }
      })
    ).body;
    await request(standin.url, `/__standin/rows/profiles/${mallory.user.id}`, { method: "DELETE" });
    const malloryProfile = await call("/api/profile", { token: mallory.session.access_token });
    check(
      "it is made the first time it is read",
      malloryProfile.status === 200 && malloryProfile.body.profile?.fullName === "Mallory",
      `${malloryProfile.status} ${JSON.stringify(malloryProfile.body)}`
    );
    check(
      "and an email sign-up does not get to choose its photo's address",
      malloryProfile.body.profile?.avatarUrl === null,
      JSON.stringify(malloryProfile.body)
    );
    await request(standin.url, `/__standin/rows/profiles/${gina.user.id}`, { method: "DELETE" });
    const ginaRemade = await call("/api/profile", { token: ginaToken });
    check(
      "a Google account's is made with its Google photo",
      ginaRemade.body.profile?.avatarUrl === googlePhoto,
      JSON.stringify(ginaRemade.body)
    );

    // Sign-up metadata is whatever the request carried, and a sign-up does not
    // have to come from our app.
    const hostile = (
      await control("users", {
        email: "hostile@standin.test",
        provider: "google",
        metadata: {
          full_name: `${"x".repeat(200)}\n\nCheat at\tmaths`,
          avatar_url: "https://tracker.example/pixel.png"
        }
      })
    ).body;
    await request(standin.url, `/__standin/rows/profiles/${hostile.user.id}`, { method: "DELETE" });
    const hostileProfile = (await call("/api/profile", { token: hostile.session.access_token })).body.profile;
    check(
      "a name from sign-up is cut to length and squeezed onto one line",
      hostileProfile?.fullName.length === 60 && !/[\n\t]/.test(hostileProfile.fullName),
      JSON.stringify(hostileProfile?.fullName)
    );
    check(
      "a photo address that is not Google's is refused, even from a Google sign-up",
      hostileProfile?.avatarUrl === null,
      JSON.stringify(hostileProfile?.avatarUrl)
    );

    section("Renaming");
    const rename = (token, fullName) => call("/api/profile", { method: "PATCH", token, body: { fullName } });
    const tooShort = await rename(carolToken, "  C  ");
    check("a one-letter name is refused", tooShort.status === 400, `got ${tooShort.status}`);
    const tooLong = await rename(carolToken, "x".repeat(61));
    check("so is one past the limit", tooLong.status === 400, `got ${tooLong.status}`);
    const renamed = await rename(carolToken, "  Carol \n  Smith ");
    check(
      "a new name is saved, with its spacing tidied",
      renamed.status === 200 && renamed.body.profile?.fullName === "Carol Smith",
      JSON.stringify(renamed.body)
    );
    const [carolRow] = await rows("profiles", `?id=eq.${carolId}`);
    check("in the profile row", carolRow?.full_name === "Carol Smith", JSON.stringify(carolRow));
    const carolAccount = (await control(`users/${carolId}`)).body.user;
    check(
      "and on the account, for the browser to show before the profile loads",
      carolAccount?.user_metadata?.full_name === "Carol Smith",
      JSON.stringify(carolAccount?.user_metadata)
    );

    // What every Google sign-in does to the account: Google's name over the top.
    await request(standin.url, "/auth/v1/user", {
      method: "PUT",
      token: carolToken,
      body: { data: { full_name: "Name From Google" } }
    });
    const afterGoogle = await call("/api/profile", { token: carolToken });
    check(
      "a sign-in that rewrites the account's name leaves the profile's alone",
      afterGoogle.body.profile?.fullName === "Carol Smith",
      JSON.stringify(afterGoogle.body)
    );

    section("Usernames");
    const patchProfile = (token, body) => call("/api/profile", { method: "PATCH", token, body });
    const usernameAvailable = (token, name) =>
      call(`/api/profile/username-available?username=${encodeURIComponent(name)}`, { token });
    const usernameOf = async (token) => (await call("/api/profile", { token })).body.profile?.username;
    const signUpAs = async (email, fullName) => (await control("users", { email, fullName })).body;

    check(
      "an account gets a username at sign-up, from its name",
      carolProfile.body.profile?.username === "carol" && ginaProfile.body.profile?.username === "gina_google",
      JSON.stringify([carolProfile.body.profile?.username, ginaProfile.body.profile?.username])
    );
    check(
      "and so does a profile the API had to make itself",
      malloryProfile.body.profile?.username === "mallory",
      JSON.stringify(malloryProfile.body.profile)
    );

    const nihad = await signUpAs("nihad@standin.test", "Nihad");
    const nihadToken = nihad.session.access_token;
    const secondNihad = await signUpAs("nihad.two@standin.test", "Nihad");
    check(
      "the next student with the same name gets a number",
      (await usernameOf(nihadToken)) === "nihad" && (await usernameOf(secondNihad.session.access_token)) === "nihad2"
    );
    // A username is shown to everyone a student asks and every friend, so it
    // must never give away the email address (migration 0013).
    check(
      "a Russian name is written out in Latin letters, not taken from the email",
      (await usernameOf((await signUpAs("igor.secret@standin.test", "Игорь Петров")).session.access_token)) === "igor_petrov"
    );
    check(
      "a name with too few letters becomes \"student\", not the start of the email",
      /^student\d*$/.test((await usernameOf((await signUpAs("al.secret@standin.test", "Al")).session.access_token)) ?? "") &&
        /^student\d*$/.test(
          (await usernameOf((await signUpAs("rtl.secret@standin.test", "عبد الرحمن")).session.access_token)) ?? ""
        )
    );
    check(
      "and a reserved name is never handed out",
      (await usernameOf((await signUpAs("admin@standin.test", "Admin")).session.access_token)) === "admin2"
    );

    const refusals = [
      ["", "empty"],
      ["ab", "too-short"],
      ["x".repeat(21), "too-long"],
      ["has space", "bad-characters"],
      ["Нихад", "bad-characters"],
      ["1abc", "bad-start"],
      ["_abc", "bad-start"]
    ];
    for (const [name, problem] of refusals) {
      const refused = await patchProfile(carolToken, { username: name });
      check(
        `${JSON.stringify(name.length > 12 ? `${name.slice(0, 12)}...` : name)} is refused as ${problem}`,
        refused.status === 400 && refused.body.code === "username-invalid" && refused.body.problem === problem,
        `${refused.status} ${JSON.stringify(refused.body)}`
      );
    }
    for (const name of ["admin", "Admin", "@ExamPeak", "ad.min", "exam_peak", "SUPPORT"]) {
      const refused = await patchProfile(carolToken, { username: name });
      check(
        `${JSON.stringify(name)} is reserved`,
        refused.status === 400 && refused.body.code === "username-reserved",
        `${refused.status} ${JSON.stringify(refused.body)}`
      );
    }
    const notText = await patchProfile(carolToken, { username: 5 });
    check("a username that is not text is refused", notText.status === 400, `got ${notText.status}`);
    const nothing = await patchProfile(carolToken, {});
    check("and so is a request that changes nothing", nothing.status === 400, `got ${nothing.status}`);

    // Names are stored lowercase, so "Nihad" and "nihad" are one name.
    for (const name of ["nihad", "Nihad", "  @NIHAD ", "nihad2"]) {
      const taken = await patchProfile(carolToken, { username: name });
      check(
        `${JSON.stringify(name)} is taken, whatever its case`,
        taken.status === 409 && taken.body.code === "username-taken" && taken.body.message === "That username is taken.",
        `${taken.status} ${JSON.stringify(taken.body)}`
      );
    }
    const notHalfSaved = await patchProfile(carolToken, { fullName: "Should Not Stick", username: "Nihad" });
    check(
      "a refused username leaves the name it came with unsaved",
      notHalfSaved.status === 409 && (await call("/api/profile", { token: carolToken })).body.profile?.fullName === "Carol Smith",
      JSON.stringify(notHalfSaved.body)
    );

    const changedUsername = await patchProfile(carolToken, { username: "  @Carol_S " });
    check(
      "a free username is saved lowercase, without the @",
      changedUsername.status === 200 && changedUsername.body.profile?.username === "carol_s",
      JSON.stringify(changedUsername.body)
    );
    check("and is what the profile says from then on", (await usernameOf(carolToken)) === "carol_s");
    const [usernameRow] = await rows("profiles", `?id=eq.${carolId}`);
    check("in the profile row", usernameRow?.username === "carol_s", JSON.stringify(usernameRow));
    check(
      "keeping the name it has is no change, and no refusal",
      (await patchProfile(carolToken, { username: "Carol_S" })).status === 200
    );

    const savedTogether = await patchProfile(carolToken, { fullName: "Carol Smith II", username: "carol.s2" });
    check(
      "a name and a username can be saved together",
      savedTogether.status === 200 &&
        savedTogether.body.profile?.fullName === "Carol Smith II" &&
        savedTogether.body.profile?.username === "carol.s2",
      JSON.stringify(savedTogether.body)
    );
    const justTheName = await patchProfile(carolToken, { fullName: "Carol Smith" });
    check(
      "and the name alone leaves the username",
      justTheName.status === 200 && justTheName.body.profile?.username === "carol.s2",
      JSON.stringify(justTheName.body)
    );

    // trim() keeps characters that draw nothing, so these used to be saved
    // and showed as a blank name in the header and on friends' lists.
    for (const [label, invisible] of [
      ["zero-width spaces", "​​​"],
      ["Hangul fillers", "ㅤㅤ"]
    ]) {
      const blank = await patchProfile(carolToken, { fullName: invisible });
      check(
        `a name made only of ${label} is refused like an empty one`,
        blank.status === 400 && blank.body.code === "name-invalid" && blank.body.message === "Enter your name.",
        JSON.stringify(blank.body)
      );
    }
    const strayMarks = await patchProfile(carolToken, { fullName: "Carol​ Smith‏" });
    check(
      "invisible characters inside a real name are taken out",
      strayMarks.status === 200 && strayMarks.body.profile?.fullName === "Carol Smith",
      JSON.stringify(strayMarks.body)
    );

    check(
      "the answer to \"is it free?\" needs a sign-in",
      (await call("/api/profile/username-available?username=anything")).status === 401
    );
    const askTaken = await usernameAvailable(carolToken, "Nihad");
    check(
      "a taken name is reported, in its stored form",
      askTaken.status === 200 && askTaken.body.available === false && askTaken.body.reason === "taken" && askTaken.body.username === "nihad",
      JSON.stringify(askTaken.body)
    );
    const askFree = await usernameAvailable(carolToken, "totally.free");
    check(
      "a free one is reported free",
      askFree.body.available === true && askFree.body.reason === null,
      JSON.stringify(askFree.body)
    );
    const askOwn = await usernameAvailable(carolToken, "@Carol.S2");
    check(
      "the asker's own is theirs",
      askOwn.body.available === true && askOwn.body.reason === "yours",
      JSON.stringify(askOwn.body)
    );
    check(
      "the name a student gave up is free again",
      (await usernameAvailable(nihadToken, "carol")).body.available === true
    );
    const askShort = await usernameAvailable(carolToken, "ab");
    check(
      "a name that breaks a rule says which",
      askShort.status === 200 && askShort.body.reason === "invalid" && askShort.body.problem === "too-short",
      JSON.stringify(askShort.body)
    );
    check("a reserved one says so", (await usernameAvailable(carolToken, "Admin")).body.reason === "reserved");
    check("asking about nothing is a bad request", (await call("/api/profile/username-available", { token: carolToken })).status === 400);

    // Two students save the same free name at the same moment. Looking first
    // and saving after would let both through; the unique index lets one.
    const racerA = await signUpAs("racer.a@standin.test", "Racer A");
    const racerB = await signUpAs("racer.b@standin.test", "Racer B");
    await control("latency", { ms: 40 });
    const [racerOne, racerTwo] = await Promise.all([
      patchProfile(racerA.session.access_token, { username: "racer.name" }),
      patchProfile(racerB.session.access_token, { username: "Racer.Name" })
    ]);
    await control("latency", { ms: 0 });
    check(
      "two students saving one name at once: one gets it and one is told it is taken",
      [racerOne.status, racerTwo.status].sort().join() === "200,409",
      JSON.stringify([racerOne.status, racerTwo.body, racerTwo.status])
    );
    check("and only one profile has it", (await rows("profiles", "?username=eq.racer.name")).length === 1);

    // What the stand-in does in place of the database, checked directly so a
    // passing run is not just the API agreeing with itself.
    const duplicate = await request(standin.url, `/__standin/rows/profiles/${carolId}`, {
      method: "PATCH",
      body: { username: "nihad" }
    });
    check(
      "the database's unique index refuses a duplicate",
      duplicate.status === 409 && JSON.stringify(duplicate.body).includes("profiles_username_key"),
      `${duplicate.status} ${JSON.stringify(duplicate.body)}`
    );
    const uppercase = await request(standin.url, `/__standin/rows/profiles/${carolId}`, {
      method: "PATCH",
      body: { username: "Carol" }
    });
    check(
      "and its check refuses a name that is not lowercase",
      uppercase.status >= 400 && JSON.stringify(uppercase.body).includes("profiles_username_format"),
      `${uppercase.status} ${JSON.stringify(uppercase.body)}`
    );

    // findProfileByUsername is what the friends feature looks students up by.
    // There is no route for it here, so run the real function against the stand-in.
    const lookUp = (name) =>
      new Promise((resolve, reject) => {
        const script = `
          import { findProfileByUsername } from "./apps/api/src/repositories/profileRepository.ts";
          console.log(JSON.stringify(await findProfileByUsername(process.argv[1])));
        `;
        const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, name], {
          cwd: root,
          env: { ...process.env, SUPABASE_URL: standin.url, SUPABASE_SERVICE_ROLE_KEY: "standin-service-role-key" },
          stdio: ["ignore", "pipe", "pipe"]
        });
        let out = "";
        let err = "";
        child.stdout.on("data", (chunk) => (out += chunk));
        child.stderr.on("data", (chunk) => (err += chunk));
        child.on("exit", (code) =>
          code === 0 ? resolve(JSON.parse(out.trim().split("\n").at(-1))) : reject(new Error(err.slice(0, 400)))
        );
      });

    const found = await lookUp("  @NIHAD ");
    check(
      "findProfileByUsername finds a student by a name in any case, with or without the @",
      found?.id === nihad.user.id && found?.username === "nihad" && found?.fullName === "Nihad",
      JSON.stringify(found)
    );
    check("and finds nobody for a name nobody has", (await lookUp("nobody.has.this")) === null);
    check("or for something that could not be a username", (await lookUp("has space")) === null);

    section("Profile photos");
    const PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64"
    );
    const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
    const uploadPhoto = (token, bytes) =>
      call("/api/profile/photo", { method: "PUT", token, body: { dataBase64: bytes.toString("base64") } });
    const removePhoto = (token) => call("/api/profile/photo", { method: "DELETE", token });
    const photoFiles = async (accountId) => (await control(`objects?prefix=avatars/${accountId}/`)).body.objects ?? [];

    const svg = await uploadPhoto(carolToken, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'));
    check(
      "a file that is not a photo is refused",
      svg.status === 400 && svg.body.code === "photo-type",
      `${svg.status} ${JSON.stringify(svg.body)}`
    );
    const huge = await uploadPhoto(carolToken, Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]));
    check("a photo over 2 MB is refused", huge.status === 413 && huge.body.code === "photo-too-large", `got ${huge.status}`);
    check("and neither leaves a file behind", (await photoFiles(carolId)).length === 0, JSON.stringify(await photoFiles(carolId)));

    const firstPhoto = await uploadPhoto(carolToken, PNG);
    const firstUrl = firstPhoto.body.profile?.avatarUrl ?? "";
    check(
      "a photo uploads into the account's own folder",
      firstPhoto.status === 200 && firstUrl.startsWith(`${standin.url}/storage/v1/object/public/avatars/${carolId}/`),
      `${firstPhoto.status} ${JSON.stringify(firstPhoto.body)}`
    );
    const served = await fetch(firstUrl);
    const servedBytes = Buffer.from(await served.arrayBuffer());
    check(
      "and is served from the public bucket as the image it is",
      served.status === 200 && served.headers.get("content-type") === "image/png" && servedBytes.equals(PNG),
      `${served.status} ${served.headers.get("content-type")}`
    );

    const secondPhoto = await uploadPhoto(carolToken, JPEG);
    const secondUrl = secondPhoto.body.profile?.avatarUrl ?? "";
    check(
      "a new photo takes its place at a new address",
      secondPhoto.status === 200 && secondUrl !== firstUrl && secondUrl.endsWith(".jpg"),
      JSON.stringify(secondPhoto.body)
    );
    const afterReplace = await photoFiles(carolId);
    check(
      "and the old file is deleted",
      afterReplace.length === 1 && secondUrl.endsWith(afterReplace[0]),
      JSON.stringify(afterReplace)
    );

    const removed = await removePhoto(carolToken);
    check(
      "removing the photo clears it from the profile",
      removed.status === 200 && removed.body.profile?.avatarUrl === null,
      JSON.stringify(removed.body)
    );
    check("and deletes the file", (await photoFiles(carolId)).length === 0, JSON.stringify(await photoFiles(carolId)));
    const goneFile = await fetch(secondUrl);
    check("which stops being served", goneFile.status !== 200, `got ${goneFile.status}`);

    const ginaRemoved = await removePhoto(ginaToken);
    check(
      "a Google photo can be removed as well",
      ginaRemoved.status === 200 && ginaRemoved.body.profile?.avatarUrl === null,
      JSON.stringify(ginaRemoved.body)
    );

    // Two tabs at once. Sweeping the folder after each upload meant each one
    // deleted the other's file, leaving the profile pointing at nothing.
    await control("latency", { ms: 40 });
    const bothAtOnce = await Promise.all([uploadPhoto(carolToken, PNG), uploadPhoto(carolToken, JPEG)]);
    await control("latency", { ms: 0 });
    const settled = (await call("/api/profile", { token: carolToken })).body.profile;
    const remaining = await photoFiles(carolId);
    check(
      "both uploads are accepted",
      bothAtOnce.every((upload) => upload.status === 200),
      JSON.stringify(bothAtOnce.map((upload) => upload.status))
    );
    check(
      "and the photo left on the profile is one whose file is still there",
      remaining.some((path) => settled?.avatarUrl?.endsWith(path)),
      `${settled?.avatarUrl} is not among ${JSON.stringify(remaining)}`
    );
    await removePhoto(carolToken);

    // Named rather than counted: the two uploads above raced on purpose, and
    // the one that lost is still in the folder until the account is deleted.
    const stuck = await uploadPhoto(carolToken, PNG);
    const stuckPath = (stuck.body.profile?.avatarUrl ?? "").split("/public/")[1];
    await control("faults", { method: "DELETE", table: "storage/avatars", times: 1 });
    const stuckRemoval = await removePhoto(carolToken);
    check(
      "a photo whose file cannot be deleted says so rather than claiming it is gone",
      stuckRemoval.status === 500 && /could not be deleted/.test(stuckRemoval.body.message ?? ""),
      `${stuckRemoval.status} ${JSON.stringify(stuckRemoval.body)}`
    );
    const stillShown = await call("/api/profile", { token: carolToken });
    check(
      "and it is left on the profile, so trying again can still find the file",
      typeof stillShown.body.profile?.avatarUrl === "string",
      JSON.stringify(stillShown.body.profile?.avatarUrl)
    );
    const retriedRemoval = await removePhoto(carolToken);
    check(
      "and removing it again finishes the job",
      retriedRemoval.status === 200 && !(await photoFiles(carolId)).includes(stuckPath),
      `${retriedRemoval.status}, ${stuckPath} still in ${JSON.stringify(await photoFiles(carolId))}`
    );

    // The browser changes the email and the password with Supabase directly,
    // so none of this goes through the API. It is checked here against the
    // stand-in's imitation of the auth server because of what the API does
    // afterwards: the profile follows the account's email, and deleting an
    // account reads the email it confirms against from the auth server.
    section("Changing the email");
    const dana = (await control("users", { email: "dana@standin.test", fullName: "Dana" })).body;
    const danaId = dana.user.id;
    const danaToken = dana.session.access_token;
    const authUser = (token, body) => request(standin.url, "/auth/v1/user", { method: "PUT", token, body });
    const signInWith = (email, password) =>
      request(standin.url, "/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });

    const notAnEmail = await authUser(danaToken, { email: "not-an-email" });
    check(
      "something that is not an email address is refused",
      notAnEmail.status === 400 && notAnEmail.body.error_code === "email_address_invalid",
      `${notAnEmail.status} ${JSON.stringify(notAnEmail.body)}`
    );
    const usedEmail = await authUser(danaToken, { email: "alice@standin.test" });
    check(
      "so is an address another account already uses",
      usedEmail.status === 422 && usedEmail.body.error_code === "email_exists",
      `${usedEmail.status} ${JSON.stringify(usedEmail.body)}`
    );
    const sameEmail = await authUser(danaToken, { email: "Dana@standin.test" });
    check(
      "the address the account has already is not a change",
      sameEmail.status === 200 && sameEmail.body.new_email === undefined,
      JSON.stringify(sameEmail.body)
    );

    const asked = await authUser(danaToken, { email: "dana.new@standin.test" });
    check(
      "a new address is held back until its link is opened",
      asked.status === 200 && asked.body.email === "dana@standin.test" && asked.body.new_email === "dana.new@standin.test",
      JSON.stringify(asked.body)
    );
    const sentMail = (await control("emails")).body.emails ?? [];
    check(
      "and the link is sent to the new address",
      sentMail.some((mail) => mail.to === "dana.new@standin.test" && mail.userId === danaId),
      JSON.stringify(sentMail)
    );
    check(
      "the profile keeps the old address meanwhile",
      (await call("/api/profile", { token: danaToken })).body.profile?.email === "dana@standin.test"
    );
    check("and the old address still signs in", (await signInWith("dana@standin.test", "password1")).status === 200);

    await control("confirm-email-change", { userId: danaId });
    check(
      "opening the link moves the profile to the new address",
      (await call("/api/profile", { token: danaToken })).body.profile?.email === "dana.new@standin.test"
    );
    check(
      "and the username does not follow the email",
      (await call("/api/profile", { token: danaToken })).body.profile?.username === "dana"
    );
    check("which now signs in", (await signInWith("dana.new@standin.test", "password1")).status === 200);
    check("and the old one does not", (await signInWith("dana@standin.test", "password1")).status === 400);

    // The token Dana still holds was issued before the change, so it still
    // names the old address. Confirming deletion against that would turn her
    // away for typing her own address.
    const oldAddress = await call("/api/profile", {
      method: "DELETE",
      token: danaToken,
      body: { confirmEmail: "dana@standin.test" }
    });
    check(
      "deleting does not accept the address the account used to have",
      oldAddress.status === 400 && oldAddress.body.code === "confirmation-mismatch",
      `${oldAddress.status} ${JSON.stringify(oldAddress.body)}`
    );
    check(
      "her username is taken while she has the account",
      (await usernameAvailable(nihadToken, "dana")).body.reason === "taken"
    );
    const newAddress = await call("/api/profile", {
      method: "DELETE",
      token: danaToken,
      body: { confirmEmail: "Dana.New@standin.test" }
    });
    check(
      "but takes the new one even though the token still carries the old",
      newAddress.status === 200 && newAddress.body.deleted === true,
      `${newAddress.status} ${JSON.stringify(newAddress.body)}`
    );
    check(
      "deleting the account makes its username free again",
      (await usernameAvailable(nihadToken, "dana")).body.available === true &&
        (await rows("profiles", "?username=eq.dana")).length === 0,
      JSON.stringify((await usernameAvailable(nihadToken, "dana")).body)
    );
    check("so nobody is found by it", (await lookUp("dana")) === null);
    const danaAgain = await patchProfile(secondNihad.session.access_token, { username: "dana" });
    check(
      "and another student can take it",
      danaAgain.status === 200 && danaAgain.body.profile?.username === "dana",
      JSON.stringify(danaAgain.body)
    );

    // Confirmation switched off in the project: the change applies at once.
    await control("mail", { confirmEmailChange: false });
    const quick = (await control("users", { email: "quentin@standin.test", fullName: "Quentin" })).body;
    const applied = await authUser(quick.session.access_token, { email: "quentin.new@standin.test" });
    check(
      "a project that does not ask for confirmation applies the change at once",
      applied.status === 200 && applied.body.email === "quentin.new@standin.test" && applied.body.new_email === undefined,
      JSON.stringify(applied.body)
    );
    await control("mail", { confirmEmailChange: true });

    section("A forgotten password");
    // The stand-in plays the reset email the way GoTrue sends it, so the page's
    // trip can be followed end to end: ask, open the link, swap the code,
    // set the new password, sign in with it.
    const fern = (await control("users", { email: "fern@standin.test", fullName: "Fern", password: "forgotten1" })).body;
    const mailBefore = (await control("emails")).body.emails.length;
    const unknownReset = await request(standin.url, "/auth/v1/recover?redirect_to=" + encodeURIComponent("http://app.test/#/reset-password"), {
      method: "POST",
      body: { email: "nobody-here@standin.test" }
    });
    check(
      "asking for an address with no account answers the same, and sends nothing",
      unknownReset.status === 200 && (await control("emails")).body.emails.length === mailBefore,
      `${unknownReset.status} ${JSON.stringify(unknownReset.body)}`
    );

    const verifier = randomUUID() + randomUUID();
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const fernReset = await request(standin.url, "/auth/v1/recover?redirect_to=" + encodeURIComponent("http://app.test/#/reset-password"), {
      method: "POST",
      body: { email: "Fern@standin.test", code_challenge: challenge, code_challenge_method: "s256" }
    });
    const resetMail = (await control("emails")).body.emails.find((mail) => mail.kind === "recovery" && mail.userId === fern.user.id);
    check("an account's address gets a reset link in the inbox", fernReset.status === 200 && Boolean(resetMail?.link), JSON.stringify(resetMail));

    const opened = await fetch(resetMail?.link ?? "http://127.0.0.1:9", { redirect: "manual" });
    const landing = new URL(opened.headers.get("location") ?? "http://invalid.test/");
    check(
      "opening it goes back to the reset page with a one-time code",
      opened.status === 302 && landing.hash === "#/reset-password" && Boolean(landing.searchParams.get("code")),
      `${opened.status} ${landing}`
    );
    const reused = await fetch(resetMail?.link ?? "http://127.0.0.1:9", { redirect: "manual" });
    check(
      "and works only once",
      /otp_expired/.test(reused.headers.get("location") ?? ""),
      reused.headers.get("location")
    );

    const recoverySession = await request(standin.url, "/auth/v1/token?grant_type=pkce", {
      method: "POST",
      body: { auth_code: landing.searchParams.get("code"), code_verifier: verifier }
    });
    check("the code is swapped for a session by the browser that asked", recoverySession.status === 200, JSON.stringify(recoverySession.body));
    const newPassword = await request(standin.url, "/auth/v1/user", {
      method: "PUT",
      token: recoverySession.body.access_token,
      body: { password: "remembered2" }
    });
    check("which can set the new password", newPassword.status === 200, JSON.stringify(newPassword.body));
    check(
      "that then signs in, where the forgotten one no longer does",
      (await request(standin.url, "/auth/v1/token?grant_type=password", { method: "POST", body: { email: "fern@standin.test", password: "remembered2" } })).status === 200 &&
        (await request(standin.url, "/auth/v1/token?grant_type=password", { method: "POST", body: { email: "fern@standin.test", password: "forgotten1" } })).status === 400
    );

    section("Confirming a new account");
    // With "Confirm email" on, the web app sends the page the student was
    // signing up for along in the link's redirect, as "?next=". The stand-in
    // has to hand that address back intact, code added, for the app to use it.
    await control("mail", { confirmSignUp: true });
    const signUpVerifier = randomUUID() + randomUUID();
    const signUpRedirect = "http://app.test/?next=" + encodeURIComponent("/build?subject=math");
    const signedUp = await request(standin.url, "/auth/v1/signup?redirect_to=" + encodeURIComponent(signUpRedirect), {
      method: "POST",
      body: {
        email: "hazel@standin.test",
        password: "confirmme1",
        data: { full_name: "Hazel" },
        code_challenge: createHash("sha256").update(signUpVerifier).digest("base64url"),
        code_challenge_method: "s256"
      }
    });
    check(
      "a sign-up waiting for its email gets an account but no session",
      signedUp.status === 200 && Boolean(signedUp.body.id) && !signedUp.body.access_token && !signedUp.body.email_confirmed_at,
      JSON.stringify(signedUp.body).slice(0, 200)
    );
    check(
      "and cannot sign in until the link is opened",
      (await signInWith("hazel@standin.test", "confirmme1")).body.error_code === "email_not_confirmed"
    );

    const signUpMail = (await control("emails")).body.emails.find((mail) => mail.kind === "signup" && mail.to === "hazel@standin.test");
    const confirmed = await fetch(signUpMail?.link ?? "http://127.0.0.1:9", { redirect: "manual" });
    const confirmedLanding = new URL(confirmed.headers.get("location") ?? "http://invalid.test/");
    check(
      "opening the link comes back to the address the app gave, with a one-time code",
      confirmed.status === 302 &&
        confirmedLanding.searchParams.get("next") === "/build?subject=math" &&
        Boolean(confirmedLanding.searchParams.get("code")),
      `${confirmed.status} ${confirmedLanding}`
    );
    const signUpSession = await request(standin.url, "/auth/v1/token?grant_type=pkce", {
      method: "POST",
      body: { auth_code: confirmedLanding.searchParams.get("code"), code_verifier: signUpVerifier }
    });
    check(
      "which the browser that signed up swaps for a session",
      signUpSession.status === 200 && Boolean(signUpSession.body.user?.email_confirmed_at),
      JSON.stringify(signUpSession.body).slice(0, 200)
    );
    check("and the account now signs in", (await signInWith("hazel@standin.test", "confirmme1")).status === 200);
    await control("mail", { confirmSignUp: false });

    section("Changing the password");
    const erin = (await control("users", { email: "erin@standin.test", fullName: "Erin", password: "oldpass123" })).body;
    const erinToken = erin.session.access_token;

    const samePassword = await authUser(erinToken, { password: "oldpass123" });
    check(
      "the password it already has is refused",
      samePassword.status === 422 && samePassword.body.error_code === "same_password",
      `${samePassword.status} ${JSON.stringify(samePassword.body)}`
    );
    const weakPassword = await authUser(erinToken, { password: "abc12" });
    check(
      "so is one the project finds too short",
      weakPassword.status === 422 && weakPassword.body.error_code === "weak_password",
      `${weakPassword.status} ${JSON.stringify(weakPassword.body)}`
    );
    check("a refused password changes nothing", (await signInWith("erin@standin.test", "oldpass123")).status === 200);

    const changed = await authUser(erinToken, { password: "newpass456" });
    check("a new password is accepted", changed.status === 200, JSON.stringify(changed.body));
    check("and signs in", (await signInWith("erin@standin.test", "newpass456")).status === 200);
    check("where the old one no longer does", (await signInWith("erin@standin.test", "oldpass123")).status === 400);

    // An account made with Google has no password to change, only one to set.
    const gwen = (
      await control("users", {
        email: "gwen@standin.test",
        provider: "google",
        metadata: { full_name: "Gwen Google", name: "Gwen Google" }
      })
    ).body;
    check("a Google account starts with no password", (await signInWith("gwen@standin.test", "gwenpass789")).status === 400);
    check(
      "and only Google as a way in",
      gwen.user.identities.map((identity) => identity.provider).join() === "google",
      JSON.stringify(gwen.user.identities)
    );
    const gwenSet = await authUser(gwen.session.access_token, { password: "gwenpass789" });
    check("it can set one", gwenSet.status === 200, JSON.stringify(gwenSet.body));
    check("and then signs in with its email address", (await signInWith("gwen@standin.test", "gwenpass789")).status === 200);
    check(
      "which the account now lists as a way in, next to Google",
      gwenSet.body.identities?.map((identity) => identity.provider).sort().join() === "email,google",
      JSON.stringify(gwenSet.body.identities)
    );

    section("Deleting an account");
    const carolTest = (await generate(carolId, carolToken)).body.test;
    await submit(carolTest, carolId, rightAnswers(carolTest), carolToken);
    // The link to the account is looked up when a paper is generated, and a
    // failed lookup records the paper under the account's id with no link.
    await control("faults", { method: "GET", table: "profiles", times: 1 });
    const unlinkedTest = (await generate(carolId, carolToken)).body.test;
    const [unlinkedRow] = await rows("test_attempts", `?id=eq.${unlinkedTest?.id}`);
    check(
      "a paper can be under the account's id without being linked to it",
      unlinkedRow?.student_key === carolId && unlinkedRow?.student_id === null,
      JSON.stringify(unlinkedRow)
    );
    await uploadPhoto(carolToken, PNG);

    const deleteCarol = (confirmEmail) =>
      call("/api/profile", { method: "DELETE", token: carolToken, body: confirmEmail === undefined ? {} : { confirmEmail } });

    const unconfirmed = await deleteCarol(undefined);
    check("deleting needs the email typed back", unconfirmed.status === 400, `got ${unconfirmed.status}`);

    // Deleting cannot be undone, and the email to confirm with can be read
    // straight out of the token, so this one operation asks the auth server
    // whether the session is still live rather than trusting the signature.
    const strandedSession = (await control("users", { email: "stranded@standin.test", fullName: "Stranded" })).body;
    await control("expire-sessions", { userId: strandedSession.user.id });
    const strandedDelete = await call("/api/profile", {
      method: "DELETE",
      token: strandedSession.session.access_token,
      body: { confirmEmail: "stranded@standin.test" }
    });
    check(
      "a token from a session that has ended cannot delete the account",
      strandedDelete.status === 401,
      `got ${strandedDelete.status}`
    );
    check(
      "and the account is still there",
      (await rows("profiles", `?id=eq.${strandedSession.user.id}`)).length === 1
    );
    const misconfirmed = await deleteCarol("someone-else@standin.test");
    check(
      "and the right one",
      misconfirmed.status === 400 && misconfirmed.body.code === "confirmation-mismatch",
      JSON.stringify(misconfirmed.body)
    );

    await control("faults", { method: "DELETE", table: "storage/avatars", times: 1 });
    const halfway = await deleteCarol("carol@standin.test");
    check("a deletion that cannot remove the photos is reported", halfway.status === 500, `got ${halfway.status}`);
    const stillThere = await call("/api/profile", { token: carolToken });
    const historyStillThere = await rows("test_attempts", `?student_key=eq.${carolId}`);
    check(
      "and stops before the history or the account go",
      stillThere.status === 200 && historyStillThere.length === 2,
      `${stillThere.status}, ${historyStillThere.length} attempts`
    );

    const deleted = await deleteCarol("  CAROL@standin.test ");
    check(
      "the account is deleted, whatever case the email is typed in",
      deleted.status === 200 && deleted.body.deleted === true,
      `${deleted.status} ${JSON.stringify(deleted.body)}`
    );
    const afterDelete = await call("/api/profile", { token: carolToken });
    check("its token stops working", afterDelete.status === 401, `got ${afterDelete.status}`);
    check("the account is gone", (await control(`users/${carolId}`)).status === 404);
    check("so is its profile", (await rows("profiles", `?id=eq.${carolId}`)).length === 0);
    check(
      "and its username, which anyone can take now",
      (await usernameAvailable(nihadToken, "carol.s2")).body.available === true &&
        (await patchProfile(nihadToken, { username: "carol.s2" })).status === 200
    );
    const leftByKey = await rows("test_attempts", `?student_key=eq.${carolId}`);
    const leftById = await rows("test_attempts", `?student_id=eq.${carolId}`);
    check(
      "every paper it sat is gone, linked to it or not",
      leftByKey.length === 0 && leftById.length === 0,
      `${leftByKey.length} by key, ${leftById.length} by id`
    );
    const leftAnswers = await rows("attempt_questions", `?attempt_id=in.(${carolTest.id},${unlinkedTest.id})`);
    check("with every answer on them", leftAnswers.length === 0, `${leftAnswers.length} left`);
    check("and every photo", (await photoFiles(carolId)).length === 0, JSON.stringify(await photoFiles(carolId)));

    const ginaAfter = await call("/api/profile", { token: ginaToken });
    const aliceRowsAfter = await rows("test_attempts", `?student_id=eq.${aliceId}`);
    check(
      "nobody else's profile or history is touched",
      ginaAfter.status === 200 && aliceRowsAfter.length > 0,
      `${ginaAfter.status}, ${aliceRowsAfter.length} of Alice's attempts`
    );

    // The friends checks are in a block of their own, so their names cannot
    // clash with the profile checks above.
    {
      // -----------------------------------------------------------------------
      // Friends. Each part below uses accounts of its own, so a failure in one
      // cannot leave another looking right by accident.
      // -----------------------------------------------------------------------
      const friendsOf = (token) => call("/api/friends", { token });
      const ask = (token, who) => call("/api/friends/requests", { method: "POST", token, body: { emailOrUsername: who } });
      const answer = (token, requestId, verb) => call(`/api/friends/requests/${requestId}/${verb}`, { method: "POST", token });
      const withdraw = (token, requestId) => call(`/api/friends/requests/${requestId}`, { method: "DELETE", token });
      const unfriend = (token, friendshipId) => call(`/api/friends/${friendshipId}`, { method: "DELETE", token });
      // The username is whatever 0013's generator made of the account, so it
      // is read back rather than guessed from the email or the name.
      const makeAccount = async (email, fullName) => {
        const made = (await control("users", { email, fullName })).body;
        const token = made.session.access_token;
        const username = (await call("/api/profile", { token })).body.profile.username;
        return { id: made.user.id, token, email, username };
      };
      // "gabe" -> "GaBe": the same username, typed in mixed case.
      const mixedCase = (name) => [...name].map((letter, index) => (index % 2 ? letter : letter.toUpperCase())).join("");
      const friendRows = (query = "") => rows("friendships", query);
      // Nobody is ever sent an email address that is not their own.
      const leaksAnEmail = (body) => JSON.stringify(body).includes("@standin.test");

      section("Friends need a signed-in account");
      const friendsNoToken = await call("/api/friends");
      check("the friends list is not readable without a token", friendsNoToken.status === 401, `got ${friendsNoToken.status}`);
      const friendsJunkToken = await call("/api/friends", { token: "not-a-token" });
      check("nor with something that is not a token", friendsJunkToken.status === 401, `got ${friendsJunkToken.status}`);
      const askNoToken = await ask(undefined, "alice@standin.test");
      check("a request cannot be sent without one", askNoToken.status === 401, `got ${askNoToken.status}`);

      section("A new account has no friends, and a figure to compare with");
      const fiona = await makeAccount("fiona.f@standin.test", "Fiona");
      const gabe = await makeAccount("gabe.test@standin.test", "Gabe");
      const iris = await makeAccount("iris@standin.test", "Iris");
      const fionaFresh = await friendsOf(fiona.token);
      check(
        "the lists are empty and her own progress is zero tests",
        fionaFresh.status === 200 &&
          fionaFresh.body.friends.length === 0 &&
          fionaFresh.body.incoming.length === 0 &&
          fionaFresh.body.outgoing.length === 0 &&
          fionaFresh.body.me.testsTaken === 0 &&
          fionaFresh.body.me.best === null,
        JSON.stringify(fionaFresh.body)
      );

      // Two papers for Fiona, both perfect; one for Gabe, all wrong. Different
      // enough that mixing the two up would show.
      for (let paper = 0; paper < 2; paper += 1) {
        const test = (await generate(fiona.id, fiona.token)).body.test;
        await submit(test, fiona.id, rightAnswers(test), fiona.token);
      }
      const gabeTest = (await generate(gabe.id, gabe.token)).body.test;
      await submit(gabeTest, gabe.id, wrongAnswers(gabeTest), gabe.token);

      section("Asking by email");
      const firstAsk = await ask(fiona.token, "  GABE.TEST@Standin.Test ");
      check(
        "a request goes to the account, however the address is typed",
        firstAsk.status === 201 &&
          firstAsk.body.outcome === "requested" &&
          firstAsk.body.person?.id === gabe.id &&
          firstAsk.body.person?.fullName === "Gabe" &&
          firstAsk.body.person?.username === gabe.username,
        `${firstAsk.status} ${JSON.stringify(firstAsk.body)}`
      );
      check("and what comes back is a name, a username and a photo, not an address", !leaksAnEmail(firstAsk.body));

      const gabeSees = await friendsOf(gabe.token);
      check(
        "Gabe sees it as incoming, from Fiona",
        gabeSees.body.incoming.length === 1 &&
          gabeSees.body.incoming[0].id === fiona.id &&
          gabeSees.body.incoming[0].fullName === "Fiona" &&
          gabeSees.body.incoming[0].username === fiona.username &&
          typeof gabeSees.body.incoming[0].requestId === "string",
        JSON.stringify(gabeSees.body.incoming)
      );
      check("and not yet as a friend", gabeSees.body.friends.length === 0 && gabeSees.body.outgoing.length === 0);

      const fionaSees = await friendsOf(fiona.token);
      check(
        "Fiona sees it as outgoing, to Gabe",
        fionaSees.body.outgoing.length === 1 && fionaSees.body.outgoing[0].id === gabe.id && fionaSees.body.incoming.length === 0,
        JSON.stringify(fionaSees.body.outgoing)
      );
      check("and a pending request shows nothing of Gabe's progress", !("progress" in fionaSees.body.outgoing[0]));
      check("nobody's email address is in either list", !leaksAnEmail(gabeSees.body) && !leaksAnEmail(fionaSees.body));

      const requestId = gabeSees.body.incoming[0].requestId;
      check("both sides are looking at the same row", fionaSees.body.outgoing[0].requestId === requestId);

      section("Requests that cannot be sent");
      const again = await ask(fiona.token, "gabe.test@standin.test");
      check("asking twice is refused", again.status === 409 && again.body.code === "already-requested", `${again.status} ${JSON.stringify(again.body)}`);
      check("and makes no second row", (await friendRows(`?user_id=eq.${fiona.id}`)).length === 1);

      const selfEmail = await ask(fiona.token, "FIONA.F@standin.test");
      check("your own email is refused", selfEmail.status === 400 && selfEmail.body.code === "yourself", `${selfEmail.status} ${JSON.stringify(selfEmail.body)}`);
      const selfName = await ask(fiona.token, `@${mixedCase(fiona.username)}`);
      check("so is your own username", selfName.status === 400 && selfName.body.code === "yourself", `${selfName.status} ${JSON.stringify(selfName.body)}`);

      const unknownEmail = await ask(fiona.token, "nobody.at.all@standin.test");
      check(
        "an email nobody signed up with says so",
        unknownEmail.status === 404 &&
          unknownEmail.body.code === "no-account" &&
          unknownEmail.body.message === "No Exampeak account with that email or username.",
        `${unknownEmail.status} ${JSON.stringify(unknownEmail.body)}`
      );
      const unknownName = await ask(fiona.token, "@nobody.at.all");
      check("and so does a username nobody has", unknownName.status === 404 && unknownName.body.code === "no-account", `${unknownName.status} ${JSON.stringify(unknownName.body)}`);

      for (const nonsense of ["", "   ", "@", "two words"]) {
        const refused = await ask(fiona.token, nonsense);
        check(`${JSON.stringify(nonsense)} is not something to look up`, refused.status === 400 && refused.body.code === "invalid-lookup", `${refused.status} ${JSON.stringify(refused.body)}`);
      }
      const lookupNotText = await call("/api/friends/requests", { method: "POST", token: fiona.token, body: { emailOrUsername: 42 } });
      check("a request with no text in it is a 400, not a crash", lookupNotText.status === 400, `got ${lookupNotText.status}`);
      check("none of those made a row", (await friendRows(`?user_id=eq.${fiona.id}`)).length === 1);

      section("Only the right person can answer");
      for (const [label, run] of [
        ["the one who asked cannot accept their own request", () => answer(fiona.token, requestId, "accept")],
        ["nor decline it", () => answer(fiona.token, requestId, "decline")],
        ["a stranger cannot accept it", () => answer(iris.token, requestId, "accept")],
        ["nor decline it", () => answer(iris.token, requestId, "decline")],
        ["nor cancel it", () => withdraw(iris.token, requestId)],
        ["the one who was asked cannot cancel it as if it were theirs", () => withdraw(gabe.token, requestId)],
        ["a request that is not yet a friendship cannot be removed as one", () => unfriend(fiona.token, requestId)],
        ["a stranger cannot remove it either", () => unfriend(iris.token, requestId)]
      ]) {
        const refused = await run();
        check(label, refused.status === 404, `${refused.status} ${JSON.stringify(refused.body)}`);
      }
      for (const id of ["not-a-uuid", randomUUID()]) {
        const refused = await answer(gabe.token, id, "accept");
        check(`${id.length > 20 ? "an unknown" : "a malformed"} request id is a 404, not a database error`, refused.status === 404, `${refused.status} ${JSON.stringify(refused.body)}`);
      }
      const stillWaiting = await friendsOf(gabe.token);
      check("and after all that, the request is still waiting", stillWaiting.body.incoming.length === 1);

      section("Accepting, and comparing progress");
      const accepted = await answer(gabe.token, requestId, "accept");
      check(
        "the one who was asked can accept",
        accepted.status === 200 && accepted.body.outcome === "accepted" && accepted.body.person?.id === fiona.id,
        `${accepted.status} ${JSON.stringify(accepted.body)}`
      );
      const acceptedAgain = await answer(gabe.token, requestId, "accept");
      check("accepting twice is a 404, not a second friendship", acceptedAgain.status === 404, `got ${acceptedAgain.status}`);

      const fionaFriends = await friendsOf(fiona.token);
      const gabeFriends = await friendsOf(gabe.token);
      check(
        "each sees the other as a friend, and nothing is left waiting",
        fionaFriends.body.friends.length === 1 &&
          fionaFriends.body.friends[0].id === gabe.id &&
          gabeFriends.body.friends.length === 1 &&
          gabeFriends.body.friends[0].id === fiona.id &&
          [fionaFriends, gabeFriends].every((side) => side.body.incoming.length === 0 && side.body.outgoing.length === 0),
        JSON.stringify([fionaFriends.body, gabeFriends.body])
      );
      check(
        "with the same friendship id on both sides, and the day it began",
        fionaFriends.body.friends[0].friendshipId === gabeFriends.body.friends[0].friendshipId &&
          !Number.isNaN(Date.parse(fionaFriends.body.friends[0].since)),
        JSON.stringify(fionaFriends.body.friends[0])
      );
      check("and each sees the other's username", fionaFriends.body.friends[0].username === gabe.username && gabeFriends.body.friends[0].username === fiona.username);

      const gabeAsSeenByFiona = fionaFriends.body.friends[0].progress;
      check(
        "Fiona sees Gabe's one test, all wrong",
        gabeAsSeenByFiona.testsTaken === 1 &&
          gabeAsSeenByFiona.best?.score === 0 &&
          gabeAsSeenByFiona.best?.percentage === 0 &&
          gabeAsSeenByFiona.averagePercentage === 0 &&
          !Number.isNaN(Date.parse(gabeAsSeenByFiona.lastActiveAt)),
        JSON.stringify(gabeAsSeenByFiona)
      );
      const fionaAsSeenByGabe = gabeFriends.body.friends[0].progress;
      check(
        "Gabe sees Fiona's two perfect ones",
        fionaAsSeenByGabe.testsTaken === 2 &&
          fionaAsSeenByGabe.best?.percentage === 100 &&
          fionaAsSeenByGabe.best?.score === fionaAsSeenByGabe.best?.totalMarks &&
          fionaAsSeenByGabe.averagePercentage === 100 &&
          !Number.isNaN(Date.parse(fionaAsSeenByGabe.lastActiveAt)),
        JSON.stringify(fionaAsSeenByGabe)
      );
      check(
        "each also gets their own figures to set beside a friend's",
        fionaFriends.body.me.testsTaken === 2 && gabeFriends.body.me.testsTaken === 1,
        JSON.stringify([fionaFriends.body.me, gabeFriends.body.me])
      );
      check("and still no email address anywhere in it", !leaksAnEmail(fionaFriends.body) && !leaksAnEmail(gabeFriends.body));

      const irisAlone = await friendsOf(iris.token);
      check("a stranger sees none of it", irisAlone.body.friends.length === 0 && irisAlone.body.incoming.length === 0 && irisAlone.body.outgoing.length === 0);

      section("Already friends");
      const askFriend = await ask(fiona.token, "gabe.test@standin.test");
      check("asking a friend is refused", askFriend.status === 409 && askFriend.body.code === "already-friends", `${askFriend.status} ${JSON.stringify(askFriend.body)}`);
      const askFriendBack = await ask(gabe.token, `@${mixedCase(fiona.username)}`);
      check("from either side", askFriendBack.status === 409 && askFriendBack.body.code === "already-friends", `${askFriendBack.status} ${JSON.stringify(askFriendBack.body)}`);
      check("and it is still the one row", (await friendRows(`?or=(user_id.eq.${fiona.id},friend_id.eq.${fiona.id})`)).length === 1);

      section("Removing a friend");
      const friendshipId = fionaFriends.body.friends[0].friendshipId;
      const strangerRemoves = await unfriend(iris.token, friendshipId);
      check("somebody who is not in the friendship cannot end it", strangerRemoves.status === 404, `got ${strangerRemoves.status}`);
      check("and it holds", (await friendsOf(fiona.token)).body.friends.length === 1);
      const unfriended = await unfriend(fiona.token, friendshipId);
      check("either of the two can", unfriended.status === 200, `${unfriended.status} ${JSON.stringify(unfriended.body)}`);
      const afterRemove = [await friendsOf(fiona.token), await friendsOf(gabe.token)];
      check("it ends for both", afterRemove.every((side) => side.body.friends.length === 0 && side.body.incoming.length === 0 && side.body.outgoing.length === 0));
      check("and the row is gone", (await friendRows(`?id=eq.${friendshipId}`)).length === 0);
      const removedAgain = await unfriend(gabe.token, friendshipId);
      check("removing again is a 404", removedAgain.status === 404, `got ${removedAgain.status}`);
      check("and their tests are untouched by it", (await friendsOf(fiona.token)).body.me.testsTaken === 2);

      section("Asking by username");
      // The way Nihad will most likely try it: mixed case, a leading @, and a
      // dot in the middle, which must not be mistaken for the start of a domain.
      const byUsername = await ask(fiona.token, `@${mixedCase(gabe.username)}`);
      check(
        "a username works in any case with a leading @",
        byUsername.status === 201 && byUsername.body.outcome === "requested" && byUsername.body.person?.id === gabe.id,
        `${byUsername.status} ${JSON.stringify(byUsername.body)}`
      );
      const declinedId = (await friendsOf(gabe.token)).body.incoming[0]?.requestId;
      const declined = await answer(gabe.token, declinedId, "decline");
      check("a request can be declined", declined.status === 200, `${declined.status} ${JSON.stringify(declined.body)}`);
      const afterDecline = [await friendsOf(fiona.token), await friendsOf(gabe.token)];
      check(
        "which clears it for both",
        afterDecline.every((side) => side.body.incoming.length === 0 && side.body.outgoing.length === 0 && side.body.friends.length === 0)
      );
      const askedAfterDecline = await ask(fiona.token, gabe.username);
      check("and she may ask again, this time with a bare username", askedAfterDecline.status === 201, `${askedAfterDecline.status} ${JSON.stringify(askedAfterDecline.body)}`);
      // Spellings the profile page folds onto the same name: a full-width "＠"
      // from a phone keyboard, the Azerbaijani "İ" and "ə". Each must find Gabe
      // (who already has her request), not "no account with that username".
      const folded = `＠${gabe.username.replace(/i/g, "İ").replace(/e/g, "ə")}`;
      const askedFolded = await ask(fiona.token, folded);
      check(
        "a username spelt the way the profile page folds it finds the same account",
        askedFolded.status === 409 && askedFolded.body.code === "already-requested",
        `${folded}: ${askedFolded.status} ${JSON.stringify(askedFolded.body)}`
      );

      section("Taking a request back");
      const outgoingId = (await friendsOf(fiona.token)).body.outgoing[0]?.requestId;
      const strangerCancels = await withdraw(iris.token, outgoingId);
      check("only the one who asked can cancel it", strangerCancels.status === 404, `got ${strangerCancels.status}`);
      const cancelled = await withdraw(fiona.token, outgoingId);
      check("and she can", cancelled.status === 200, `${cancelled.status} ${JSON.stringify(cancelled.body)}`);
      const afterCancel = [await friendsOf(fiona.token), await friendsOf(gabe.token)];
      check("it is gone from both lists", afterCancel.every((side) => side.body.incoming.length === 0 && side.body.outgoing.length === 0));
      const cancelledAgain = await withdraw(fiona.token, outgoingId);
      check("cancelling again is a 404", cancelledAgain.status === 404, `got ${cancelledAgain.status}`);
      const acceptCancelled = await answer(gabe.token, outgoingId, "accept");
      check("and a cancelled request cannot be accepted", acceptCancelled.status === 404, `got ${acceptCancelled.status}`);

      section("Two students asking each other");
      const hana = await makeAccount("hana@standin.test", "Hana");
      const jack = await makeAccount("jack@standin.test", "Jack");
      const hanaAsks = await ask(hana.token, "jack@standin.test");
      check("Hana asks Jack", hanaAsks.status === 201, `${hanaAsks.status} ${JSON.stringify(hanaAsks.body)}`);
      const jackAsks = await ask(jack.token, "hana");
      check(
        "Jack asking Hana back accepts hers, rather than making a second request",
        jackAsks.status === 200 && jackAsks.body.outcome === "accepted" && jackAsks.body.person?.id === hana.id,
        `${jackAsks.status} ${JSON.stringify(jackAsks.body)}`
      );
      const pairRows = await friendRows(`?or=(user_id.eq.${hana.id},friend_id.eq.${hana.id})`);
      check("there is one row between them, and it is accepted", pairRows.length === 1 && pairRows[0].status === "accepted", JSON.stringify(pairRows));
      check("with the time it was answered", typeof pairRows[0]?.responded_at === "string");
      const crossed = [await friendsOf(hana.token), await friendsOf(jack.token)];
      check(
        "and they are friends both ways",
        crossed[0].body.friends[0]?.id === jack.id && crossed[1].body.friends[0]?.id === hana.id && crossed[0].body.outgoing.length === 0 && crossed[1].body.incoming.length === 0
      );

      section("Two requests that crossed in the post");
      // The table only forbids the same direction twice, so two students who ask
      // at the same instant can leave one pending row each way. Written straight
      // into the stand-in, as that race would.
      const kim = await makeAccount("kim@standin.test", "Kim");
      const lars = await makeAccount("lars@standin.test", "Lars");
      for (const [from, to] of [[kim, lars], [lars, kim]]) {
        const written = await request(standin.url, "/rest/v1/friendships", { method: "POST", body: { user_id: from.id, friend_id: to.id } });
        check("a pending row can be written each way", written.status === 201, `${written.status} ${JSON.stringify(written.body)}`);
      }
      const kimView = await friendsOf(kim.token);
      const larsView = await friendsOf(lars.token);
      check(
        "each sees one request to answer, not an incoming and an outgoing for the same person",
        kimView.body.incoming.length === 1 && kimView.body.outgoing.length === 0 && larsView.body.incoming.length === 1 && larsView.body.outgoing.length === 0,
        JSON.stringify([kimView.body, larsView.body])
      );
      const crossedAccept = await answer(kim.token, kimView.body.incoming[0].requestId, "accept");
      check("accepting it works", crossedAccept.status === 200, `${crossedAccept.status} ${JSON.stringify(crossedAccept.body)}`);
      const crossedRows = await friendRows(`?or=(user_id.eq.${kim.id},friend_id.eq.${kim.id})`);
      check("and clears the other, leaving one accepted row", crossedRows.length === 1 && crossedRows[0].status === "accepted", JSON.stringify(crossedRows));
      const larsAfter = await friendsOf(lars.token);
      check("so Lars is a friend and has nothing left to answer", larsAfter.body.friends.length === 1 && larsAfter.body.incoming.length === 0, JSON.stringify(larsAfter.body));

      section("A blocked row");
      const mona = await makeAccount("mona@standin.test", "Mona");
      const nils = await makeAccount("nils@standin.test", "Nils");
      await ask(mona.token, "nils");
      const [blockedRow] = await friendRows(`?user_id=eq.${mona.id}`);
      await request(standin.url, `/__standin/rows/friendships/${blockedRow.id}`, { method: "PATCH", body: { status: "blocked" } });
      const monaBlocked = await ask(mona.token, "nils");
      const nilsBlocked = await ask(nils.token, "mona");
      check(
        "neither can ask the other over it",
        monaBlocked.status === 403 && nilsBlocked.status === 403 && monaBlocked.body.code === "blocked",
        `${monaBlocked.status} ${nilsBlocked.status}`
      );
      const blockedViews = [await friendsOf(mona.token), await friendsOf(nils.token)];
      check(
        "and it shows in nobody's lists",
        blockedViews.every((side) => side.body.friends.length + side.body.incoming.length + side.body.outgoing.length === 0)
      );
      const acceptBlocked = await answer(nils.token, blockedRow.id, "accept");
      check("a blocked request cannot be accepted", acceptBlocked.status === 404, `got ${acceptBlocked.status}`);

      section("What the friendships table itself refuses");
      const insertRow = (body) => request(standin.url, "/rest/v1/friendships", { method: "POST", body });
      const toSelf = await insertRow({ user_id: mona.id, friend_id: mona.id });
      check("nobody is their own friend", toSelf.status === 400 && toSelf.body.code === "23514", `${toSelf.status} ${JSON.stringify(toSelf.body)}`);
      const duplicate = await insertRow({ user_id: mona.id, friend_id: nils.id });
      check("the same direction twice", duplicate.status === 409 && duplicate.body.code === "23505", `${duplicate.status} ${JSON.stringify(duplicate.body)}`);
      const reverse = await insertRow({ user_id: nils.id, friend_id: mona.id });
      check("the other direction is allowed, which is why the app has to cope with it", reverse.status === 201, `${reverse.status} ${JSON.stringify(reverse.body)}`);
      const badStatus = await insertRow({ user_id: iris.id, friend_id: nils.id, status: "declined" });
      check("a status the migration does not list", badStatus.status === 400 && badStatus.body.code === "23514", `${badStatus.status} ${JSON.stringify(badStatus.body)}`);
      const nobody = await insertRow({ user_id: iris.id, friend_id: randomUUID() });
      check("a friend who has no profile", nobody.status === 409 && nobody.body.code === "23503", `${nobody.status} ${JSON.stringify(nobody.body)}`);
      const sharedName = await request(standin.url, `/__standin/rows/profiles/${nils.id}`, { method: "PATCH", body: { username: "mona" } });
      check("two profiles cannot share a username", sharedName.status === 409 && sharedName.body.code === "23505", `${sharedName.status} ${JSON.stringify(sharedName.body)}`);

      section("Deleting an account takes its friendships with it");
      const omar = await makeAccount("omar@standin.test", "Omar");
      const nora = await makeAccount("nora@standin.test", "Nora");
      await ask(omar.token, "nora@standin.test");
      await answer(nora.token, (await friendsOf(nora.token)).body.incoming[0].requestId, "accept");
      const pending = await makeAccount("pia@standin.test", "Pia");
      await ask(pending.token, "omar");
      check("Omar has a friend and a request waiting", (await friendsOf(omar.token)).body.friends.length === 1 && (await friendsOf(omar.token)).body.incoming.length === 1);
      const omarDeleted = await call("/api/profile", { method: "DELETE", token: omar.token, body: { confirmEmail: "omar@standin.test" } });
      check("Omar deletes his account", omarDeleted.status === 200, `${omarDeleted.status} ${JSON.stringify(omarDeleted.body)}`);
      check(
        "Nora and Pia are left with nothing pointing at him",
        (await friendsOf(nora.token)).body.friends.length === 0 && (await friendsOf(pending.token)).body.outgoing.length === 0
      );
      check("and no row of his is left", (await friendRows(`?or=(user_id.eq.${omar.id},friend_id.eq.${omar.id})`)).length === 0);
      const askDeleted = await ask(nora.token, "omar@standin.test");
      check("his email no longer finds anyone", askDeleted.status === 404, `${askDeleted.status} ${JSON.stringify(askDeleted.body)}`);
      const askDeletedName = await ask(nora.token, "omar");
      check("nor does his username", askDeletedName.status === 404, `${askDeletedName.status} ${JSON.stringify(askDeletedName.body)}`);

      section("Friends need the tables to exist");
      const readingFriends = await friendsOf(fiona.token);
      check("a normal read still works", readingFriends.status === 200);
      await control("faults", { method: "GET", table: "friendships", times: 1, status: 500 });
      const friendsDown = await friendsOf(fiona.token);
      check(
        "a failed read is reported, not shown as no friends",
        friendsDown.status === 500 && /Failed to load your friends/.test(friendsDown.body.message ?? ""),
        `${friendsDown.status} ${JSON.stringify(friendsDown.body)}`
      );
      const afterFault = await friendsOf(fiona.token);
      check("and the next read is fine", afterFault.status === 200, `got ${afterFault.status}`);
    }

    section("A bank bigger than one page of rows");
    // Supabase stops a single read at 1,000 rows, and the catalog used to count
    // the bank from one read, so everything past the first thousand vanished
    // from the builder's figures without any error.
    // A topic of its own in a real subject, since an import refuses a subject
    // that is not one of the three.
    const bulkTopic = `bulk-${Date.now()}`;
    const bulkRows = ["subject,topic,difficulty,question,correct_answer"];
    for (let index = 0; index < 1005; index += 1) {
      bulkRows.push(`math,${bulkTopic},easy,"Bulk question ${index}",${index}`);
    }
    const bulk = await call("/api/admin/questions/import", {
      method: "POST",
      token: adminToken,
      body: { csv: bulkRows.join("\n") }
    });
    check("1,005 questions import", bulk.body.importedCount === 1005, `imported ${bulk.body.importedCount}`);
    const catalogLogStart = (await control("requests")).body.requests.length;
    const bulkCatalog = await call("/api/catalog");
    const counted = bulkCatalog.body.subjects
      ?.find((subject) => subject.id === "math")
      ?.topics?.find((topic) => topic.id === bulkTopic)?.total;
    check("the catalog counts every one of them", counted === 1005, `counted ${counted}`);
    const catalogPages = (await control("requests")).body.requests
      .slice(catalogLogStart)
      .filter((entry) => entry.method === "GET" && entry.table === "questions");
    // Each page carries the total, so the read stops the moment it has every
    // row rather than asking once more for an empty page.
    check("and reads the bank in as many pages as it fills", catalogPages.length === 2, `${catalogPages.length} pages`);

    // -----------------------------------------------------------------------
    // Not a Supabase code path, but this is the suite that starts APIs of its
    // own, and the only way to check what a particular .env does is to run one
    // with it.
    // -----------------------------------------------------------------------
    section("A blank ADMIN_PASSWORD means the built-in default, not an empty password");
    const blankPort = await freePort();
    const blankUrl = `http://127.0.0.1:${blankPort}`;
    const blankApi = spawn(process.execPath, ["--import", "tsx", path.join("apps", "api", "src", "server.ts")], {
      cwd: root,
      // Exactly what .env.example tells you to write: the line is there and
      // empty. dotenv reads that as "", which is not the same as unset.
      env: { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", API_PORT: String(blankPort), ADMIN_PASSWORD: "" },
      stdio: ["ignore", "ignore", "ignore"]
    });

    try {
      await waitForHealth(blankUrl, blankApi);
      const emptyPassword = await request(blankUrl, "/api/admin/login", { method: "POST", body: { password: "" } });
      check("an empty password is refused", emptyPassword.status === 401, `got ${emptyPassword.status}`);
      const memoryFriends = await request(blankUrl, "/api/friends");
      check(
        "friends say they need accounts when there is no Supabase, rather than failing",
        memoryFriends.status === 503 && memoryFriends.body.code === "friends-unavailable",
        `${memoryFriends.status} ${JSON.stringify(memoryFriends.body)}`
      );
      const fallback = await request(blankUrl, "/api/admin/login", { method: "POST", body: { password: "capstone123" } });
      check(
        "and the documented default is what actually works",
        fallback.status === 200 && fallback.body.usingDefaultPassword === true,
        `${fallback.status} ${JSON.stringify(fallback.body)}`
      );

      // Here rather than against the main API: the pause outlives this run,
      // and this API is thrown away straight after.
      section("Too many wrong admin passwords");
      const wrongTries = [];
      for (let attempt = 0; attempt < 10; attempt += 1) {
        wrongTries.push(await request(blankUrl, "/api/admin/login", { method: "POST", body: { password: `guess-${attempt}` } }));
      }
      check(
        "ten wrong passwords are each refused as wrong",
        wrongTries.every((attempt) => attempt.status === 401),
        wrongTries.map((attempt) => attempt.status).join(",")
      );
      const lockedOut = await request(blankUrl, "/api/admin/login", { method: "POST", body: { password: "capstone123" } });
      check(
        "after them even the right password is refused for a while",
        lockedOut.status === 429 && lockedOut.body.code === "too-many-attempts" && !lockedOut.body.token,
        `${lockedOut.status} ${JSON.stringify(lockedOut.body)}`
      );
      check(
        "and the refusal says how long to wait",
        lockedOut.body.retryAfterSeconds > 14 * 60 && /15 minutes/.test(lockedOut.body.message ?? ""),
        JSON.stringify(lockedOut.body)
      );
    } catch (error) {
      // A failure here is this one check's, not the whole suite's.
      check("an API with a blank ADMIN_PASSWORD starts", false, error.message);
    } finally {
      if (blankApi.exitCode === null) blankApi.kill();
    }
  } finally {
    stopApi();
    await standin.close();
    await marker.close();
  }

  console.log(`\n${counts.passed} passed, ${counts.failed} failed`);
  if (counts.failed > 0) {
    console.error("\nAPI output:\n" + apiLog.join("").trim());
  }
  process.exit(counts.failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nSupabase-mode smoke test could not run:", error.message);
  process.exit(1);
});
