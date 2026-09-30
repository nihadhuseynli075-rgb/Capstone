/**
 * The API's Supabase code paths, end to end, with no Supabase project.
 *
 *   npm run smoke:supabase
 *
 * Starts the local stand-in in scripts/supabase-standin.mjs, starts the API
 * pointed at it, runs the ordinary smoke test through it, then checks what only
 * exists in Supabase mode: account keys backed by tokens, who may move whose
 * history, two submissions of one paper at once, recovering from writes that
 * fail halfway, and the profile page's reads, renames, photos and deletion.
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
    check("a file that is not a photo is refused", svg.status === 400, `${svg.status} ${JSON.stringify(svg.body)}`);
    const huge = await uploadPhoto(carolToken, Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]));
    check("a photo over 2 MB is refused", huge.status === 413, `got ${huge.status}`);
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
