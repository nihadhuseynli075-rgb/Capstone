/**
 * The API's Supabase code paths, end to end, with no Supabase project.
 *
 *   npm run smoke:supabase
 *
 * Starts the local stand-in in scripts/supabase-standin.mjs, starts the API
 * pointed at it, runs the ordinary smoke test through it, then checks what only
 * exists in Supabase mode: account keys backed by tokens, who may move whose
 * history, two submissions of one paper at once, and recovering from writes
 * that fail halfway.
 *
 * The stand-in imitates PostgREST and GoTrue closely enough to catch the API
 * sending the wrong request or mishandling an error. It is not a real project:
 * row level security and the migration SQL are only proven against one.
 */

import { spawn } from "node:child_process";
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

async function main() {
  const standin = await startStandin({ port: 0 });
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
      ADMIN_PASSWORD
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
  } finally {
    stopApi();
    await standin.close();
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
