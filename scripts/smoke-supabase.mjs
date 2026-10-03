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
import { randomUUID } from "node:crypto";
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

    // Filling in the options through the admin form is what finishes it.
    const finished = await call(`/api/admin/questions/${stagedId}`, {
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
        explanation: ""
      }
    });
    check("saving it complete through the form makes it ready", finished.body.question?.status === "ready", JSON.stringify(finished.body));
    check("once ready it is counted again", (await stagedCount()) === 1);

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
    check(
      "a name with no Latin letters in it falls back to the start of the email",
      (await usernameOf((await signUpAs("ivan.petrov@standin.test", "Иван Петров")).session.access_token)) === "ivan.petrov"
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

    section("A bank bigger than one page of rows");
    // Supabase stops a single read at 1,000 rows, and the catalog used to count
    // the bank from one read, so everything past the first thousand vanished
    // from the builder's figures without any error.
    const bulkSubject = `bulk-${Date.now()}`;
    const bulkRows = ["subject,topic,difficulty,question,correct_answer"];
    for (let index = 0; index < 1005; index += 1) {
      bulkRows.push(`${bulkSubject},counting,easy,"Bulk question ${index}",${index}`);
    }
    const bulk = await call("/api/admin/questions/import", {
      method: "POST",
      token: adminToken,
      body: { csv: bulkRows.join("\n") }
    });
    check("1,005 questions import", bulk.body.importedCount === 1005, `imported ${bulk.body.importedCount}`);
    const catalogLogStart = (await control("requests")).body.requests.length;
    const bulkCatalog = await call("/api/catalog");
    const counted = bulkCatalog.body.subjects?.find((subject) => subject.id === bulkSubject)?.total;
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
      const fallback = await request(blankUrl, "/api/admin/login", { method: "POST", body: { password: "capstone123" } });
      check(
        "and the documented default is what actually works",
        fallback.status === 200 && fallback.body.usingDefaultPassword === true,
        `${fallback.status} ${JSON.stringify(fallback.body)}`
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
