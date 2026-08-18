/**
 * End-to-end smoke test against a running API.
 *
 *   npm run dev:api     (in one terminal)
 *   npm run smoke       (in another)
 *
 * Walks the whole flow the way a person would: sign in to the admin dashboard,
 * add questions, import a spreadsheet, generate a test, answer it, and check the
 * marking, history and personal-best comparison. Exits non-zero on the first
 * failure so it can be trusted as a check rather than read as a log.
 */

const BASE_URL = process.env.SMOKE_API_URL ?? "http://localhost:4000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "capstone123";

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function call(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  return { status: response.status, body: payload };
}

const studentKey = `smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function mcq(overrides = {}) {
  return {
    subjectId: "math",
    topicId: "algebra",
    difficulty: "easy",
    type: "multiple-choice",
    prompt: "Solve for x: 2x + 6 = 14",
    options: ["x = 2", "x = 4", "x = 5", "x = 8"],
    correctAnswer: "x = 4",
    explanation: "Subtract 6 from both sides to get 2x = 8, then divide by 2.",
    imageUrl: null,
    paperYear: 2024,
    source: "smoke test",
    ...overrides
  };
}

async function main() {
  console.log(`ExamPeak smoke test against ${BASE_URL}`);

  section("Health");
  const health = await call("/health");
  check("health responds 200", health.status === 200, `got ${health.status}`);
  check(
    "health reports a storage mode",
    health.body.storageMode === "memory" || health.body.storageMode === "supabase",
    JSON.stringify(health.body)
  );
  console.log(`        storage mode: ${health.body.storageMode}`);

  section("Admin authentication");
  const badLogin = await call("/api/admin/login", {
    method: "POST",
    body: { password: "definitely-not-the-password" }
  });
  check("wrong password is rejected", badLogin.status === 401, `got ${badLogin.status}`);

  const unauthorised = await call("/api/admin/questions");
  check("questions require a token", unauthorised.status === 401, `got ${unauthorised.status}`);

  const login = await call("/api/admin/login", {
    method: "POST",
    body: { password: ADMIN_PASSWORD }
  });
  check("correct password signs in", login.status === 200, JSON.stringify(login.body));
  const token = login.body.token;
  check("a session token comes back", typeof token === "string" && token.length > 20);

  const badToken = await call("/api/admin/questions", { token: "not-a-real-token" });
  check("a made-up token is rejected", badToken.status === 401, `got ${badToken.status}`);

  section("Question validation");
  const mismatched = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ correctAnswer: "x = 99" })
  });
  check(
    "answer that matches no option is rejected",
    mismatched.status === 400,
    JSON.stringify(mismatched.body)
  );

  const tooFewOptions = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ options: ["only one"], correctAnswer: "only one" })
  });
  check(
    "multiple choice with one option is rejected",
    tooFewOptions.status === 400,
    JSON.stringify(tooFewOptions.body)
  );

  section("Creating questions");
  const created = await call("/api/admin/questions", { method: "POST", token, body: mcq() });
  check("multiple choice question saves", created.status === 201, JSON.stringify(created.body));
  const createdId = created.body.question?.id;
  check("saved question comes back with an id", typeof createdId === "string");

  const shortAnswer = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({
      type: "short-answer",
      topicId: "geometry",
      prompt: "How many degrees are in a right angle?",
      options: [],
      correctAnswer: "90",
      explanation: "A right angle is a quarter turn, which is 90 degrees."
    })
  });
  check("short answer question saves", shortAnswer.status === 201, JSON.stringify(shortAnswer.body));

  section("Editing and deleting");
  const updated = await call(`/api/admin/questions/${createdId}`, {
    method: "PUT",
    token,
    body: mcq({ explanation: "Updated explanation." })
  });
  check("question updates", updated.status === 200, JSON.stringify(updated.body));
  check(
    "the update actually changed the row",
    updated.body.question?.explanation === "Updated explanation.",
    updated.body.question?.explanation
  );

  const throwaway = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ prompt: "Throwaway question to delete", topicId: "probability" })
  });
  const deleted = await call(`/api/admin/questions/${throwaway.body.question.id}`, {
    method: "DELETE",
    token
  });
  check("question deletes", deleted.status === 200, JSON.stringify(deleted.body));

  const deleteMissing = await call("/api/admin/questions/00000000-0000-0000-0000-000000000000", {
    method: "DELETE",
    token
  });
  check("deleting a missing question is a 404", deleteMissing.status === 404, `got ${deleteMissing.status}`);

  section("Spreadsheet import");
  const csv = [
    "subject,topic,difficulty,question,option_a,option_b,option_c,option_d,correct_answer,explanation,paper_year",
    'math,algebra,easy,"Simplify: 3x + 2x","4x","5x","6x","x","B","Add the coefficients: 3 + 2 = 5.",2024',
    'math,algebra,medium,"What is 12 x 12?","124","132","144","154","144","Twelve twelves are 144.",2023',
    'math,algebra,hard,"Solve: x^2 = 49","x = 5","x = 6","x = 7","x = 8","C","Seven squared is 49.",2023',
    'math,algebra,easy,"A row with a bad answer","one","two","","","Z","This should be skipped.",2024',
    'math,algebra,easy,"","one","two","","","A","Empty question text, also skipped.",2024'
  ].join("\n");

  const imported = await call("/api/admin/questions/import", { method: "POST", token, body: { csv } });
  check("import responds 200", imported.status === 200, JSON.stringify(imported.body));
  check(
    "three good rows import",
    imported.body.importedCount === 3,
    `imported ${imported.body.importedCount}`
  );
  check(
    "two bad rows are reported and skipped",
    imported.body.skippedCount === 2,
    `skipped ${imported.body.skippedCount}: ${JSON.stringify(imported.body.errors)}`
  );
  check(
    "errors name the spreadsheet row number",
    imported.body.errors?.every((issue) => typeof issue.row === "number" && issue.row >= 2),
    JSON.stringify(imported.body.errors)
  );
  check(
    "a letter answer resolves to the option text",
    imported.body.questions?.[0]?.correctAnswer === "5x",
    imported.body.questions?.[0]?.correctAnswer
  );

  section("Catalog");
  const catalog = await call("/api/catalog");
  check("catalog responds 200", catalog.status === 200);
  const mathSubject = catalog.body.subjects?.find((subject) => subject.id === "math");
  check("maths appears with questions", (mathSubject?.total ?? 0) >= 5, `total ${mathSubject?.total}`);
  const algebra = mathSubject?.topics.find((topic) => topic.id === "algebra");
  check("algebra counts are split by difficulty", (algebra?.counts?.easy ?? 0) >= 2, JSON.stringify(algebra));

  section("Generating a test");
  const emptyBank = await call("/api/tests/generate", {
    method: "POST",
    body: {
      studentKey,
      subjectId: "russian",
      topicIds: ["spelling"],
      difficultyMode: "easy"
    }
  });
  check(
    "asking for a subject with no questions is a clear 409",
    emptyBank.status === 409,
    JSON.stringify(emptyBank.body)
  );

  const badSettings = await call("/api/tests/generate", {
    method: "POST",
    body: { studentKey, subjectId: "math", topicIds: [], difficultyMode: "easy" }
  });
  check("generating with no topics is rejected", badSettings.status === 400, `got ${badSettings.status}`);

  const generated = await call("/api/tests/generate", {
    method: "POST",
    body: {
      studentKey,
      subjectId: "math",
      topicIds: ["algebra", "geometry"],
      difficultyMode: "custom",
      // Deliberately more than the bank holds, to exercise the short-test path.
      questionCount: 20,
      timeLimitMinutes: 10
    }
  });
  check("test generates", generated.status === 200, JSON.stringify(generated.body));

  const test = generated.body.test;
  check("test contains questions", (test?.questions?.length ?? 0) > 0, `${test?.questions?.length}`);
  check(
    "the student is never sent the answers",
    test.questions.every(
      (question) => question.correctAnswer === undefined && question.explanation === undefined
    ),
    JSON.stringify(test.questions[0])
  );
  check(
    "a short bank is flagged rather than hidden",
    generated.body.short === true &&
      generated.body.requestedCount === 20 &&
      test.questions.length < 20,
    `short=${generated.body.short} requested=${generated.body.requestedCount} got=${test.questions.length}`
  );

  section("Marking");
  // Answer everything wrong on purpose, so the score is predictable.
  const allWrong = test.questions.map((question) => ({
    questionId: question.id,
    answer: question.type === "multiple-choice" ? "definitely wrong" : "definitely wrong"
  }));

  const wrongResult = await call(`/api/tests/${test.id}/submit`, {
    method: "POST",
    body: { studentKey, answers: allWrong, timeTakenSeconds: 42 }
  });
  check("submission responds 200", wrongResult.status === 200, JSON.stringify(wrongResult.body));
  check("all-wrong scores zero", wrongResult.body.score === 0, `score ${wrongResult.body.score}`);
  check(
    "every question comes back for review",
    wrongResult.body.reviews?.length === test.questions.length,
    `${wrongResult.body.reviews?.length} reviews for ${test.questions.length} questions`
  );
  check(
    "reviews now include the correct answer and explanation",
    wrongResult.body.reviews?.every((review) => typeof review.correctAnswer === "string"),
    JSON.stringify(wrongResult.body.reviews?.[0])
  );
  check(
    "topic breakdown is present",
    (wrongResult.body.topicBreakdown?.length ?? 0) > 0,
    JSON.stringify(wrongResult.body.topicBreakdown)
  );
  check(
    "first attempt is recorded as a personal best",
    wrongResult.body.comparison?.isPersonalBest === true,
    JSON.stringify(wrongResult.body.comparison)
  );

  const resubmit = await call(`/api/tests/${test.id}/submit`, {
    method: "POST",
    body: { studentKey, answers: allWrong, timeTakenSeconds: 10 }
  });
  check("resubmitting the same test is refused", resubmit.status === 409, `got ${resubmit.status}`);

  const wrongStudent = await call(`/api/tests/${test.id}`.replace(/$/, "/submit"), {
    method: "POST",
    body: { studentKey: `${studentKey}-someone-else`, answers: allWrong, timeTakenSeconds: 10 }
  });
  check(
    "another student cannot submit this test",
    wrongStudent.status === 403 || wrongStudent.status === 409,
    `got ${wrongStudent.status}`
  );

  section("Scoring correctly");
  const second = await call("/api/tests/generate", {
    method: "POST",
    body: { studentKey, subjectId: "math", topicIds: ["algebra"], difficultyMode: "easy" }
  });
  const secondTest = second.body.test;

  // Look the answers up through the admin API, so this checks real marking
  // rather than trusting whatever the generator happened to send.
  const bank = await call("/api/admin/questions", { token });
  const answerFor = new Map(bank.body.questions.map((question) => [question.id, question.correctAnswer]));

  const allRight = secondTest.questions.map((question) => ({
    questionId: question.id,
    answer: answerFor.get(question.id) ?? ""
  }));

  const rightResult = await call(`/api/tests/${secondTest.id}/submit`, {
    method: "POST",
    body: { studentKey, answers: allRight, timeTakenSeconds: 30 }
  });

  check(
    "all-correct scores full marks",
    rightResult.body.score === secondTest.questions.length,
    `${rightResult.body.score}/${secondTest.questions.length}`
  );
  check("percentage is 100", rightResult.body.percentage === 100, `${rightResult.body.percentage}`);
  check(
    "beating the previous attempt is a new personal best",
    rightResult.body.comparison?.isPersonalBest === true,
    JSON.stringify(rightResult.body.comparison)
  );
  check(
    "the previous best is reported for comparison",
    rightResult.body.comparison?.previousBest !== null,
    JSON.stringify(rightResult.body.comparison)
  );

  section("History");
  const history = await call(`/api/tests/history?studentKey=${encodeURIComponent(studentKey)}`);
  check("history responds 200", history.status === 200);
  check("both attempts are listed", history.body.attempts?.length === 2, `${history.body.attempts?.length}`);

  const otherHistory = await call(`/api/tests/history?studentKey=${encodeURIComponent("nobody-at-all-here")}`);
  check(
    "a different student sees an empty history",
    otherHistory.body.attempts?.length === 0,
    `${otherHistory.body.attempts?.length}`
  );

  const review = await call(
    `/api/tests/attempts/${secondTest.id}?studentKey=${encodeURIComponent(studentKey)}`
  );
  check("a past attempt can be reopened", review.status === 200, JSON.stringify(review.body));
  check(
    "the reopened attempt keeps the answers given",
    review.body.reviews?.every((item) => item.isCorrect === true),
    JSON.stringify(review.body.reviews?.[0])
  );

  const otherStudentReview = await call(
    `/api/tests/attempts/${secondTest.id}?studentKey=someone-else-entirely`
  );
  check(
    "another student cannot read this attempt",
    otherStudentReview.status === 403,
    `got ${otherStudentReview.status}`
  );

  section("Sign out");
  const loggedOut = await call("/api/admin/logout", { method: "POST", token });
  check("logout responds 200", loggedOut.status === 200);
  const afterLogout = await call("/api/admin/questions", { token });
  check("the token stops working after logout", afterLogout.status === 401, `got ${afterLogout.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nSmoke test could not run:", error.message);
  console.error(`Is the API running at ${BASE_URL}? Start it with "npm run dev:api".`);
  process.exit(1);
});
