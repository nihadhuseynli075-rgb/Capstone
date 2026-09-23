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

import { createChecks, request } from "./smoke-kit.mjs";

const BASE_URL = process.env.SMOKE_API_URL ?? "http://localhost:4000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "capstone123";

const { check, section, counts } = createChecks();
const call = (path, options) => request(BASE_URL, path, options);

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
  check(
    "the submitted duration is kept",
    wrongResult.body.timeTakenSeconds >= 42,
    `timeTakenSeconds ${wrongResult.body.timeTakenSeconds}`
  );
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

  const secondTestMarks = secondTest.questions.reduce((sum, question) => sum + question.marks, 0);

  check(
    "all-correct scores full marks",
    rightResult.body.score === secondTestMarks,
    `${rightResult.body.score}/${secondTestMarks}`
  );
  check(
    "the total is the marks available, not the question count",
    rightResult.body.totalMarks === secondTestMarks,
    `totalMarks ${rightResult.body.totalMarks}, expected ${secondTestMarks}`
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

  section("Marks");
  // A question worth three, sat alongside one worth one. Getting the big one
  // right and the small one wrong has to beat the other way round, which a
  // count of correct answers could never show.
  const marksTopic = `marks-${Date.now()}`;

  const bigQuestion = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({
      topicId: marksTopic,
      difficulty: "hard",
      prompt: "Factorise fully: 2x^2 + 7x + 3",
      options: ["(2x+1)(x+3)", "(2x+3)(x+1)", "(x+1)(x+3)"],
      correctAnswer: "(2x+1)(x+3)",
      marks: 3
    })
  });
  check("a question can be worth more than one mark", bigQuestion.status === 201, JSON.stringify(bigQuestion.body));
  check(
    "the marks come back on the question",
    bigQuestion.body.question?.marks === 3,
    `marks ${bigQuestion.body.question?.marks}`
  );

  const smallQuestion = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({
      topicId: marksTopic,
      difficulty: "hard",
      prompt: "What is 2 + 2?",
      options: ["3", "4", "5"],
      correctAnswer: "4"
    })
  });
  check("marks default to one when not given", smallQuestion.body.question?.marks === 1, `marks ${smallQuestion.body.question?.marks}`);

  const marksTest = await call("/api/tests/generate", {
    method: "POST",
    body: {
      studentKey,
      subjectId: "math",
      topicIds: [marksTopic],
      difficultyMode: "custom",
      questionCount: 5,
      timeLimitMinutes: 20
    }
  });

  const served = marksTest.body.test.questions;
  check("the student is told what each question is worth", served.every((q) => typeof q.marks === "number"), JSON.stringify(served.map((q) => q.marks)));

  // Answer only the three-mark question correctly.
  const bigId = bigQuestion.body.question.id;
  const marksAnswers = served.map((question) => ({
    questionId: question.id,
    answer: question.id === bigId ? "(2x+1)(x+3)" : "definitely wrong"
  }));

  const marksResult = await call(`/api/tests/${marksTest.body.test.id}/submit`, {
    method: "POST",
    body: { studentKey, answers: marksAnswers, timeTakenSeconds: 20 }
  });

  check("a weighted test marks out of its marks", marksResult.body.totalMarks === 4, `totalMarks ${marksResult.body.totalMarks}`);
  check("the three-mark question is worth three", marksResult.body.score === 3, `score ${marksResult.body.score}`);
  check(
    "the percentage follows the marks, not the questions",
    marksResult.body.percentage === 75,
    `${marksResult.body.percentage}% - one of two questions right is 50%, three of four marks is 75%`
  );
  check(
    "the review says what each question was worth",
    marksResult.body.reviews.every((review) => review.score <= review.marks),
    JSON.stringify(marksResult.body.reviews.map((r) => `${r.score}/${r.marks}`))
  );
  check(
    "the topic breakdown is in marks too",
    marksResult.body.topicBreakdown.every((topic) => typeof topic.marks === "number" && topic.score <= topic.marks),
    JSON.stringify(marksResult.body.topicBreakdown)
  );

  section("History");
  const history = await call(`/api/tests/history?studentKey=${encodeURIComponent(studentKey)}`);
  check("history responds 200", history.status === 200);
  check("every attempt is listed", history.body.attempts?.length === 3, `${history.body.attempts?.length}`);
  check(
    "history rows carry the marks available",
    history.body.attempts?.every((attempt) => typeof attempt.totalMarks === "number" && attempt.totalMarks > 0),
    JSON.stringify(history.body.attempts?.map((a) => `${a.score}/${a.totalMarks}`))
  );

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
    "the reopened attempt still knows its marks",
    review.body.totalMarks > 0 && review.body.reviews?.every((item) => item.marks >= 1),
    `totalMarks ${review.body.totalMarks}`
  );
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

  section("Attempt ids that cannot exist");
  const malformedReview = await call(
    `/api/tests/attempts/not-a-real-id?studentKey=${encodeURIComponent(studentKey)}`
  );
  check("reopening a malformed attempt id is a 404", malformedReview.status === 404, `got ${malformedReview.status}`);
  const malformedSubmit = await call("/api/tests/not-a-real-id/submit", {
    method: "POST",
    body: { studentKey, answers: [], timeTakenSeconds: 1 }
  });
  check("submitting to a malformed attempt id is a 404", malformedSubmit.status === 404, `got ${malformedSubmit.status}`);

  section("Two submissions of one paper at once");
  // A second tab, or a retry racing the original. Exactly one may be kept, and
  // what is stored has to be that one, not a mix of the two.
  //
  // In memory storage the API handles one request start to finish before it
  // reads the next, so the two never overlap and this proves the refusal, not
  // the race. The race needs database round trips to overlap in: with Supabase
  // storage it is real, and npm run smoke:supabase runs this suite that way and
  // then again with added latency to force it.
  if (health.body.storageMode === "memory") {
    console.log("        memory storage: checks the refusal only; the race itself runs in npm run smoke:supabase");
  }
  const racerKey = `${studentKey}-racer`;
  const race = await call("/api/tests/generate", {
    method: "POST",
    body: { studentKey: racerKey, subjectId: "math", topicIds: ["algebra"], difficultyMode: "easy" }
  });
  const raceTest = race.body.test;
  const raceAnswers = (answer) =>
    raceTest.questions.map((question, position) => ({ questionId: question.id, position, answer }));
  const [raceFirst, raceSecond] = await Promise.all([
    call(`/api/tests/${raceTest.id}/submit`, {
      method: "POST",
      body: { studentKey: racerKey, answers: raceAnswers("first"), timeTakenSeconds: 5 }
    }),
    call(`/api/tests/${raceTest.id}/submit`, {
      method: "POST",
      body: { studentKey: racerKey, answers: raceAnswers("second"), timeTakenSeconds: 5 }
    })
  ]);
  const raceStatuses = [raceFirst.status, raceSecond.status].sort();
  check(
    "only one of two simultaneous submissions is accepted",
    raceStatuses[0] === 200 && raceStatuses[1] === 409,
    `statuses ${raceFirst.status} and ${raceSecond.status}`
  );
  const raceLoser = raceFirst.status === 409 ? raceFirst : raceSecond;
  check(
    "the other is told it was already submitted",
    raceLoser.body.code === "already-submitted",
    JSON.stringify(raceLoser.body)
  );
  const winningAnswer = raceFirst.status === 200 ? "first" : "second";
  const raceReview = await call(
    `/api/tests/attempts/${raceTest.id}?studentKey=${encodeURIComponent(racerKey)}`
  );
  check(
    "the stored answers are the accepted submission's",
    raceReview.body.reviews?.every((item) => item.studentAnswer === winningAnswer),
    JSON.stringify(raceReview.body.reviews?.map((item) => item.studentAnswer))
  );

  if (health.body.storageMode === "memory") {
    // With Supabase this needs a signed-in account; smoke-supabase.mjs covers it.
    section("Moving guest history onto an account");
    const guestKey = `${studentKey}-guest`;
    const accountKey = `${studentKey}-account`;
    const guestPaper = await call("/api/tests/generate", {
      method: "POST",
      body: { studentKey: guestKey, subjectId: "math", topicIds: ["algebra"], difficultyMode: "easy" }
    });
    await call(`/api/tests/${guestPaper.body.test.id}/submit`, {
      method: "POST",
      body: { studentKey: guestKey, answers: [], timeTakenSeconds: 5 }
    });

    const moved = await call("/api/tests/claim", {
      method: "POST",
      body: { studentKey: accountKey, guestKey }
    });
    check("a guest's attempts move onto the account", moved.body.claimed === 1, JSON.stringify(moved.body));
    const accountHistory = await call(`/api/tests/history?studentKey=${encodeURIComponent(accountKey)}`);
    check("the account now lists them", accountHistory.body.attempts?.length === 1, JSON.stringify(accountHistory.body));
    const guestHistory = await call(`/api/tests/history?studentKey=${encodeURIComponent(guestKey)}`);
    check("the guest key is left with nothing", guestHistory.body.attempts?.length === 0, JSON.stringify(guestHistory.body));
    const movedAgain = await call("/api/tests/claim", {
      method: "POST",
      body: { studentKey: accountKey, guestKey }
    });
    check("claiming again moves nothing", movedAgain.body.claimed === 0, JSON.stringify(movedAgain.body));
  }

  section("Spreadsheet import edge cases");
  const edgeCsv = [
    "subject,topic,difficulty,question,option_a,option_b,option_c,option_d,correct_answer,paper_year",
    // option_b is blank, so "C" must still mean the text under option_c.
    'math,import-edges,easy,"Which of these is prime?","4","","7","9","C",2024',
    'math,import-edges,easy,"A year with a digit too many","yes","no","","","A",20245',
    'math,import-edges,easy,"A year that is not whole","yes","no","","","A",2024.5',
    'math,import-edges,easy,"A year nobody wrote down","yes","no","","","A",'
  ].join("\n");
  const edges = await call("/api/admin/questions/import", { method: "POST", token, body: { csv: edgeCsv } });
  check("the edge-case import responds 200", edges.status === 200, JSON.stringify(edges.body));
  const prime = edges.body.questions?.find((question) => question.prompt === "Which of these is prime?");
  check(
    "a letter names its column even when an earlier option is blank",
    prime?.correctAnswer === "7",
    `correct answer ${JSON.stringify(prime?.correctAnswer)}`
  );
  check(
    "a year that cannot be one is reported against its row",
    edges.body.errors?.some((issue) => issue.row === 3),
    JSON.stringify(edges.body.errors)
  );
  check(
    "a year that is not a whole number is reported, not rounded",
    edges.body.errors?.some((issue) => issue.row === 4),
    JSON.stringify(edges.body.errors)
  );
  const yearless = edges.body.questions?.find((question) => question.prompt === "A year nobody wrote down");
  check("a blank year is stored as unknown", yearless !== undefined && yearless.paperYear === null, JSON.stringify(yearless));

  section("Sign out");
  const loggedOut = await call("/api/admin/logout", { method: "POST", token });
  check("logout responds 200", loggedOut.status === 200);
  const afterLogout = await call("/api/admin/questions", { token });
  check("the token stops working after logout", afterLogout.status === 401, `got ${afterLogout.status}`);

  console.log(`\n${counts.passed} passed, ${counts.failed} failed`);
  process.exit(counts.failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nSmoke test could not run:", error.message);
  console.error(`Is the API running at ${BASE_URL}? Start it with "npm run dev:api".`);
  process.exit(1);
});
