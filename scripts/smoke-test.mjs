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

  // Never a way in, whatever ADMIN_PASSWORD says. A blank `ADMIN_PASSWORD=` in
  // .env, which .env.example suggests for development, once became the
  // password itself, so leaving the box empty signed anyone in.
  const emptyLogin = await call("/api/admin/login", { method: "POST", body: { password: "" } });
  check("an empty password is rejected", emptyLogin.status === 401, `got ${emptyLogin.status}`);

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

  // Marked by the text picked, so both copies would count as the right answer.
  const repeatedOptions = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ options: ["same", "same", "other"], correctAnswer: "same" })
  });
  check(
    "two options that read the same are refused, and the refusal says so",
    repeatedOptions.status === 400 && /Two options are the same/.test(repeatedOptions.body.message ?? ""),
    JSON.stringify(repeatedOptions.body).slice(0, 200)
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

  // The subjects are a fixed list. Anything else used to be saved, and became a
  // new subject chip in every student's builder that no admin filter could find.
  const unknownSubject = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ subjectId: "chemistry" })
  });
  check("a subject that is not one of ours is rejected", unknownSubject.status === 400, JSON.stringify(unknownSubject.body));
  check(
    "the refusal says which subjects there are",
    /math, english, russian/.test(unknownSubject.body.message ?? ""),
    unknownSubject.body.message
  );

  // Names are not ids: "Mathematics" is shown to people, `math` is what is stored.
  const subjectByName = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ subjectId: "Mathematics" })
  });
  check("a subject's name is not accepted in place of its id", subjectByName.status === 400, `got ${subjectByName.status}`);

  const noSubject = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: (({ subjectId, ...rest }) => rest)(mcq())
  });
  check("a question with no subject is rejected", noSubject.status === 400, `got ${noSubject.status}`);

  const catalogAfterRefusals = await call("/api/catalog");
  const strayIds = (catalogAfterRefusals.body.subjects ?? [])
    .map((subject) => subject.id)
    .filter((id) => !["math", "english", "russian"].includes(id));
  check("none of those added a subject for students", strayIds.length === 0, strayIds.join(", "));

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

  // Every question on a DIM paper has five options, A to E. The answer here is
  // the fifth, which the admin form used to have no room for.
  const fiveTopic = `five-options-${Date.now()}`;
  const fiveOptions = ["x = 1", "x = 2", "x = 3", "x = 4", "x = 5"];
  const five = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({
      topicId: fiveTopic,
      prompt: "Solve for x: x + 1 = 6 (five options)",
      options: fiveOptions,
      correctAnswer: "x = 5"
    })
  });
  check("a five-option question saves", five.status === 201, JSON.stringify(five.body));
  const fiveId = five.body.question?.id;
  check(
    "all five options are kept, with the fifth as the answer",
    JSON.stringify(five.body.question?.options) === JSON.stringify(fiveOptions) &&
      five.body.question?.correctAnswer === "x = 5",
    JSON.stringify(five.body.question)
  );

  section("Searching the bank");
  // Postgres's ILIKE reads "%" as any run of characters and "_" as any one, so
  // a search for either used to list every question in the bank.
  const percentQuestion = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ prompt: "A price rises by 54% (search check)" })
  });
  const underscoreQuestion = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ prompt: "Name the variable x_1 (search check)" })
  });
  // PostgREST reads "*" as "%" too, and nothing escapes it there. The "+"
  // question is one a near miss for "6 * 7" would also find.
  const starQuestion = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ prompt: "Work out 6 * 7 (search check)" })
  });
  const plusQuestion = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ prompt: "Work out 6 + 7 (search check)" })
  });
  check(
    "the questions to search for save",
    [percentQuestion, underscoreQuestion, starQuestion, plusQuestion].every((saved) => saved.status === 201),
    JSON.stringify([percentQuestion.body, underscoreQuestion.body, starQuestion.body, plusQuestion.body]).slice(0, 200)
  );
  for (const [character, expected] of [
    ["%", "A price rises by 54% (search check)"],
    ["_", "Name the variable x_1 (search check)"],
    ["*", "Work out 6 * 7 (search check)"],
    ["6 * 7", "Work out 6 * 7 (search check)"]
  ]) {
    const found = await call(`/api/admin/questions?search=${encodeURIComponent(character)}`, { token });
    const prompts = (found.body.questions ?? []).map((question) => question.prompt);
    check(
      `searching for "${character}" finds only questions with that text in them`,
      found.status === 200 && prompts.includes(expected) && prompts.every((prompt) => prompt.includes(character)),
      JSON.stringify(prompts.filter((prompt) => !prompt.includes(character)).slice(0, 3))
    );
  }
  // The memory store lowercased "İ" to "i" plus a combining dot, so it and a
  // Supabase project disagreed about which questions "istanbul" and "i" find.
  const dottedQuestion = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ prompt: "How far is İstanbul from Bakı? (search check)" })
  });
  const dottedSearch = await call(`/api/admin/questions?search=${encodeURIComponent("istanbul from")}`, { token });
  check(
    'searching for "istanbul" finds "İstanbul", as Postgres lowercases it',
    dottedQuestion.status === 201 &&
      (dottedSearch.body.questions ?? []).some((question) => question.prompt.startsWith("How far is İstanbul")),
    JSON.stringify((dottedSearch.body.questions ?? []).map((question) => question.prompt))
  );

  // Pasted text often brings a space at one end, which found nothing.
  const spacedSearch = await call(`/api/admin/questions?search=${encodeURIComponent("  6 * 7 (search check)  ")}`, { token });
  check(
    "spaces at either end of a search are not looked for",
    (spacedSearch.body.questions ?? []).some((question) => question.prompt === "Work out 6 * 7 (search check)"),
    JSON.stringify((spacedSearch.body.questions ?? []).map((question) => question.prompt))
  );

  const backslash = await call(`/api/admin/questions?search=${encodeURIComponent("\\")}`, { token });
  check(
    "a backslash is searched for as itself",
    backslash.status === 200 && (backslash.body.questions ?? []).every((question) => question.prompt.includes("\\")),
    `${backslash.status} ${(backslash.body.questions ?? []).length} found`
  );

  // Only spaces used to pass, and a blank topic showed in the builder.
  const blankParts = await Promise.all([
    call("/api/admin/questions", { method: "POST", token, body: mcq({ prompt: "   " }) }),
    call("/api/admin/questions", { method: "POST", token, body: mcq({ topicId: "   " }) }),
    call("/api/admin/questions", { method: "POST", token, body: mcq({ options: ["x = 4", "  "] }) })
  ]);
  check(
    "a question, topic or option of only spaces is refused",
    blankParts.every((response) => response.status === 400),
    JSON.stringify(blankParts.map((response) => response.status))
  );
  // A topic is part of what generating a test is sent, which takes ids of at
  // most 100 characters, so a longer one could be saved but never drawn.
  const longTopic = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ topicId: "t".repeat(101) })
  });
  check("a topic longer than a test can ask for is refused", longTopic.status === 400, String(longTopic.status));

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

  const wrongSubjectUpdate = await call(`/api/admin/questions/${createdId}`, {
    method: "PUT",
    token,
    body: mcq({ subjectId: "chemistry", explanation: "Should never be saved." })
  });
  check(
    "moving a question to a subject that is not one of ours is rejected",
    wrongSubjectUpdate.status === 400 && /math, english, russian/.test(wrongSubjectUpdate.body.message ?? ""),
    JSON.stringify(wrongSubjectUpdate.body)
  );
  const afterWrongSubject = (await call("/api/admin/questions", { token })).body.questions?.find(
    (question) => question.id === createdId
  );
  check(
    "and the question was left as it was",
    afterWrongSubject?.subjectId === "math" && afterWrongSubject?.explanation === "Updated explanation.",
    JSON.stringify(afterWrongSubject)
  );

  // The fifth option has to survive an edit, and reach a student.
  const editedFive = await call(`/api/admin/questions/${fiveId}`, {
    method: "PUT",
    token,
    body: mcq({
      topicId: fiveTopic,
      prompt: "Solve for x: x + 1 = 6 (five options)",
      options: [...fiveOptions.slice(0, 4), "x = 5 (E)"],
      correctAnswer: "x = 5 (E)",
      explanation: "Subtract 1 from both sides."
    })
  });
  check(
    "a five-option question edits, keeping all five options",
    editedFive.status === 200 &&
      editedFive.body.question?.options?.length === 5 &&
      editedFive.body.question?.options?.[4] === "x = 5 (E)" &&
      editedFive.body.question?.correctAnswer === "x = 5 (E)",
    JSON.stringify(editedFive.body)
  );

  const fiveTest = await call("/api/tests/generate", {
    method: "POST",
    body: {
      studentKey: `${studentKey}-five`,
      subjectId: "math",
      topicIds: [fiveTopic],
      difficultyMode: "custom",
      questionCount: 5,
      timeLimitMinutes: 10
    }
  });
  const servedFive = fiveTest.body.test?.questions?.find((question) => question.id === fiveId);
  check(
    "a student is served all five options",
    fiveTest.status === 200 && servedFive?.options?.length === 5 && servedFive.options[4] === "x = 5 (E)",
    JSON.stringify(fiveTest.body).slice(0, 400)
  );
  await call(`/api/admin/questions/${fiveId}`, { method: "DELETE", token });

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

  section("The admin list and the whole bank");
  // The dashboard's heading counts the bank, not the search on screen: a
  // search with no hits once announced "0 questions in the bank".
  const everything = await call("/api/admin/questions", { token });
  const noHits = await call("/api/admin/questions?search=zzzz-no-match-anywhere", { token });
  check(
    "the listing says how big the whole bank is",
    everything.body.bank?.total === everything.body.questions?.length && everything.body.bank.total > 0,
    JSON.stringify(everything.body.bank)
  );
  check(
    "and a search with no hits still does",
    noHits.body.questions?.length === 0 && noHits.body.bank?.total === everything.body.bank?.total,
    JSON.stringify({ shown: noHits.body.questions?.length, bank: noHits.body.bank })
  );
  check(
    "including how many written questions it holds",
    typeof noHits.body.bank?.written === "number",
    JSON.stringify(noHits.body.bank)
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

  // The ids go into the query string of the read that draws the paper. With
  // no limit these were a 500 with Supabase and a 409 in memory.
  const scopeRequest = (overrides) =>
    call("/api/tests/generate", {
      method: "POST",
      body: { studentKey, subjectId: "math", topicIds: ["algebra"], difficultyMode: "easy", ...overrides }
    });
  const tooManyTopics = await scopeRequest({ topicIds: Array.from({ length: 10000 }, (_, index) => `topic-${index}`) });
  check("ten thousand topics are a 400", tooManyTopics.status === 400, `${tooManyTopics.status} ${JSON.stringify(tooManyTopics.body).slice(0, 200)}`);
  const hugeTopic = await scopeRequest({ topicIds: ["t".repeat(1024 * 1024)] });
  check("a megabyte-long topic id is a 400", hugeTopic.status === 400, `got ${hugeTopic.status}`);
  const hugeSubject = await scopeRequest({ subjectId: "m".repeat(1024 * 1024) });
  check("a megabyte-long subject id is a 400", hugeSubject.status === 400, `got ${hugeSubject.status}`);

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

  // The same paper settings, all right again: level with the best, which is
  // a match and not a second "new personal best".
  const third = await call("/api/tests/generate", {
    method: "POST",
    body: { studentKey, subjectId: "math", topicIds: ["algebra"], difficultyMode: "easy" }
  });
  const tieResult = await call(`/api/tests/${third.body.test.id}/submit`, {
    method: "POST",
    body: {
      studentKey,
      answers: third.body.test.questions.map((question) => ({
        questionId: question.id,
        answer: answerFor.get(question.id) ?? ""
      })),
      timeTakenSeconds: 30
    }
  });
  check(
    "equalling the best is a match, not a new personal best",
    tieResult.body.comparison?.isPersonalBest === false && tieResult.body.comparison?.matchedBest === true,
    JSON.stringify(tieResult.body.comparison)
  );
  check(
    "the previous best names its subject",
    tieResult.body.comparison?.previousBest?.subjectId === "math",
    JSON.stringify(tieResult.body.comparison?.previousBest)
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
  // All wrong, all right, the tie with it, and the marks paper.
  check("every attempt is listed", history.body.attempts?.length === 4, `${history.body.attempts?.length}`);
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

  section("Requests the server cannot read are the sender's to fix");
  // Each of these used to be a 500 with the body reader's or the router's
  // own words in it.
  const brokenEscape = await call(`/api/tests/attempts/%E0%A4%A?studentKey=${encodeURIComponent(studentKey)}`);
  check("a path with a broken percent escape is a 400", brokenEscape.status === 400, `${brokenEscape.status} ${JSON.stringify(brokenEscape.body)}`);
  const rawPost = (headers, body) =>
    fetch(`${BASE_URL}/api/tests/generate`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
  const latin1 = await rawPost({ "Content-Type": "application/json; charset=latin1" }, "{}");
  check("a charset other than UTF-8 is a 415", latin1.status === 415, `got ${latin1.status}`);
  const oddEncoding = await rawPost({ "Content-Encoding": "br2" }, "{}");
  check("an unknown content encoding is a 415", oddEncoding.status === 415, `got ${oddEncoding.status}`);
  const fakeGzip = await rawPost({ "Content-Encoding": "gzip" }, "not gzip");
  check("a body that claims gzip and is not is a 400", fakeGzip.status === 400, `got ${fakeGzip.status}`);

  section("Other websites are refused, as a 403");
  // A page on another site is refused before any route runs. That used to be
  // a 500 with a stack trace logged for every such request.
  const foreign = await fetch(`${BASE_URL}/api/catalog`, { headers: { Origin: "http://evil.example" } });
  const foreignBody = await foreign.json().catch(() => ({}));
  check(
    "a request from another website is a 403 with a code",
    foreign.status === 403 && foreignBody.code === "origin-not-allowed",
    `${foreign.status} ${JSON.stringify(foreignBody)}`
  );
  const foreignPreflight = await fetch(`${BASE_URL}/api/tests/generate`, {
    method: "OPTIONS",
    headers: { Origin: "http://evil.example", "Access-Control-Request-Method": "POST" }
  });
  check("so is its preflight", foreignPreflight.status === 403, `got ${foreignPreflight.status}`);
  // The smoke test runs against a development API, where any localhost port
  // is the Vite dev server.
  const devOrigin = await fetch(`${BASE_URL}/api/catalog`, { headers: { Origin: "http://localhost:5999" } });
  check(
    "a localhost page is allowed outside production",
    devOrigin.status === 200 && devOrigin.headers.get("access-control-allow-origin") === "http://localhost:5999",
    `got ${devOrigin.status}`
  );

  section("Untimed tests have no limit");
  // The browser's figure used to be refused above six hours, so an untimed
  // test left open that long could never be handed in, however often it retried.
  const untimedKey = `${studentKey}-untimed`;
  const untimed = await call("/api/tests/generate", {
    method: "POST",
    body: {
      studentKey: untimedKey,
      subjectId: "math",
      topicIds: ["algebra"],
      difficultyMode: "custom",
      questionCount: 5,
      timeLimitMinutes: null
    }
  });
  check(
    "an untimed test is created",
    untimed.status === 200 && untimed.body.test?.settings.timeLimitMinutes === null,
    JSON.stringify(untimed.body)
  );
  const sevenHours = 7 * 60 * 60;
  const untimedSubmit = await call(`/api/tests/${untimed.body.test?.id}/submit`, {
    method: "POST",
    body: {
      studentKey: untimedKey,
      answers: (untimed.body.test?.questions ?? []).map((question, position) => ({
        questionId: question.id,
        position,
        answer: ""
      })),
      timeTakenSeconds: sevenHours
    }
  });
  check(
    "it is still marked after more than six hours",
    untimedSubmit.status === 200,
    `${untimedSubmit.status} ${JSON.stringify(untimedSubmit.body)}`
  );
  check(
    "and the browser's figure is capped rather than taken as it came",
    untimedSubmit.body.timeTakenSeconds > 0 && untimedSubmit.body.timeTakenSeconds < sevenHours,
    `timeTakenSeconds ${untimedSubmit.body.timeTakenSeconds}`
  );
  check(
    "a figure far beyond the time the paper has been open is not believed",
    untimedSubmit.body.timeTakenSeconds <= 120,
    `timeTakenSeconds ${untimedSubmit.body.timeTakenSeconds}`
  );

  section("A timed paper cannot claim more than its limit");
  // The browser once could record six hours against a five-minute test.
  const shortKey = `${studentKey}-short`;
  const shortTimed = await call("/api/tests/generate", {
    method: "POST",
    body: {
      studentKey: shortKey,
      subjectId: "math",
      topicIds: ["algebra"],
      difficultyMode: "custom",
      questionCount: 5,
      timeLimitMinutes: 5
    }
  });
  const shortSubmit = await call(`/api/tests/${shortTimed.body.test?.id}/submit`, {
    method: "POST",
    body: { studentKey: shortKey, answers: [], timeTakenSeconds: 99999999 }
  });
  check(
    "a five-minute test handed in at once records at most five minutes",
    shortSubmit.status === 200 && shortSubmit.body.timeTakenSeconds <= 5 * 60,
    `${shortSubmit.status} timeTakenSeconds ${shortSubmit.body.timeTakenSeconds}`
  );

  section("A topic named twice is one topic");
  const repeated = await call("/api/tests/generate", {
    method: "POST",
    body: {
      studentKey: `${studentKey}-repeat`,
      subjectId: "math",
      topicIds: ["algebra", "algebra", "algebra"],
      difficultyMode: "easy"
    }
  });
  check(
    "the paper records the topic once",
    repeated.status === 200 && JSON.stringify(repeated.body.test?.settings.topicIds) === JSON.stringify(["algebra"]),
    `${repeated.status} ${JSON.stringify(repeated.body.test?.settings)}`
  );

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

    // Profiles belong to accounts, and there are none without Supabase;
    // smoke-supabase.mjs covers them.
    section("Profiles");
    const profile = await call("/api/profile");
    check(
      "the profile page is told profiles need Supabase, rather than failing",
      profile.status === 503 && profile.body.code === "profiles-unavailable",
      `${profile.status} ${JSON.stringify(profile.body)}`
    );

    // Friends are accounts too, so the page says so instead of failing.
    const friends = await call("/api/friends");
    check(
      "the friends page is told friends need Supabase, rather than failing",
      friends.status === 503 && friends.body.code === "friends-unavailable",
      `${friends.status} ${JSON.stringify(friends.body)}`
    );
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

  // A subject outside the fixed list became a subject chip of its own in the
  // student builder, which no admin filter could pick.
  const subjectCsv = [
    "subject,topic,question,correct_answer",
    "history,import-subjects,A subject we do not have,1914",
    "Mathematics,import-subjects,A subject given by its name,2"
  ].join("\n");
  const subjectImport = await call("/api/admin/questions/import", { method: "POST", token, body: { csv: subjectCsv } });
  check(
    "an import refuses a subject that is not one of ours, by row",
    subjectImport.body.importedCount === 1 &&
      subjectImport.body.errors?.length === 1 &&
      subjectImport.body.errors[0].row === 2,
    JSON.stringify(subjectImport.body.errors)
  );
  check(
    "and takes a subject given by the name the site shows",
    subjectImport.body.questions?.[0]?.subjectId === "math",
    JSON.stringify(subjectImport.body.questions?.map((question) => question.subjectId))
  );
  // The dashboard's column list names option_e, and the form has five
  // options, but the import used to drop the fifth and refuse an answer of E.
  const fiveCsv = [
    "subject,topic,question,option_a,option_b,option_c,option_d,option_e,correct_answer",
    "math,import-five,Which is the fifth option?,1,2,3,4,5,E"
  ].join("\n");
  const fiveImport = await call("/api/admin/questions/import", { method: "POST", token, body: { csv: fiveCsv } });
  check(
    "an import reads option_e, and an answer of E names it",
    fiveImport.body.questions?.[0]?.options?.length === 5 && fiveImport.body.questions[0].correctAnswer === "5",
    JSON.stringify(fiveImport.body).slice(0, 300)
  );

  // Row numbers were counted after blank rows had been dropped, so every row
  // below a gap in the sheet was reported one row too early.
  const gapCsv = ["subject,topic,question,correct_answer", "math,import-gaps,A row before the gap,1", ",,,", "math,import-gaps,,1"].join(
    "\r\n"
  );
  const gapImport = await call("/api/admin/questions/import", { method: "POST", token, body: { csv: gapCsv } });
  check(
    "a bad row below a blank one is reported by its spreadsheet row",
    gapImport.body.errors?.length === 1 && gapImport.body.errors[0].row === 4,
    JSON.stringify(gapImport.body.errors)
  );

  // A quote inside an unquoted cell opened a quoted cell that ran to the end
  // of the sheet, so the rows after it vanished without being reported.
  const inchTsv = [
    "subject\ttopic\tquestion\tcorrect_answer",
    'math\timport-inches\tA 12" ruler is how many cm?\t30',
    "math\timport-inches\tThe row after the inch mark\t5"
  ].join("\n");
  const inchImport = await call("/api/admin/questions/import", { method: "POST", token, body: { csv: inchTsv } });
  check(
    "a quote inside a tab-separated cell is text, and the rows after it import",
    inchImport.body.importedCount === 2 && inchImport.body.questions?.[0]?.prompt === 'A 12" ruler is how many cm?',
    JSON.stringify(inchImport.body).slice(0, 300)
  );

  // A topic written by its name became a second topic of the same name.
  const topicNameImport = await call("/api/admin/questions/import", {
    method: "POST",
    token,
    body: { csv: "subject,topic,question,correct_answer\nenglish,Reading Comprehension,A topic given by its name,a" }
  });
  check(
    "an import files a topic given by its name under that topic",
    topicNameImport.body.questions?.[0]?.topicId === "reading",
    JSON.stringify(topicNameImport.body.questions?.map((question) => question.topicId))
  );

  // One import shares one timestamp. Memory listed it in sheet order and
  // Supabase by id, so the two stores showed the same import differently.
  const orderCsv = ["subject,topic,question,correct_answer"]
    .concat(Array.from({ length: 6 }, (_, index) => `math,import-order,Import order check ${index + 1},1`))
    .join("\n");
  await call("/api/admin/questions/import", { method: "POST", token, body: { csv: orderCsv } });
  const orderList = (await call(`/api/admin/questions?search=${encodeURIComponent("Import order check")}`, { token })).body
    .questions ?? [];
  const inListOrder = orderList.every((question, index) => {
    const next = orderList[index + 1];
    if (!next) return true;
    return question.createdAt > next.createdAt || (question.createdAt === next.createdAt && question.id < next.id);
  });
  check(
    "the list is newest first, then by id, in either store",
    orderList.length === 6 && inListOrder,
    JSON.stringify(orderList.map((question) => [question.createdAt, question.id.slice(0, 8)]))
  );

  const subjectCatalog = await call("/api/catalog");
  check(
    "so the catalog shows no subject the bank should not have",
    (subjectCatalog.body.subjects ?? []).every((subject) => ["math", "english", "russian"].includes(subject.id)),
    JSON.stringify((subjectCatalog.body.subjects ?? []).map((subject) => subject.id))
  );

  section("Question diagrams");
  // A 1x1 PNG, the smallest real picture there is.
  const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const upload = (body) => call("/api/admin/questions/image", { method: "POST", token, body });

  const realPicture = await upload({ fileName: "diagram.png", contentType: "image/png", dataBase64: tinyPng });
  check(
    "a real picture is stored",
    realPicture.status === 200 && typeof realPicture.body.imageUrl === "string",
    JSON.stringify(realPicture.body).slice(0, 200)
  );
  const fakePicture = await upload({
    fileName: "fake.png",
    contentType: "image/png",
    dataBase64: Buffer.from("this is text, not a picture").toString("base64")
  });
  check(
    "a text file named .png is refused for what it really is",
    fakePicture.status === 400 && /not a PNG, JPG or WebP/.test(fakePicture.body.message ?? ""),
    JSON.stringify(fakePicture.body)
  );
  const notAnImage = await upload({ fileName: "notes.txt", contentType: "text/plain", dataBase64: tinyPng });
  check(
    "a non-image upload says why, not just \"not valid\"",
    notAnImage.status === 400 && notAnImage.body.message === "Only image files are supported.",
    JSON.stringify(notAnImage.body)
  );
  // Over the 5 MB body limit, as a 4.5 MB picture is once base64 encoded.
  const hugePicture = await upload({ fileName: "huge.png", contentType: "image/png", dataBase64: "A".repeat(6 * 1024 * 1024) });
  check(
    "a picture over the body limit is a 413 that says the size, not a 500",
    hugePicture.status === 413 && hugePicture.body.message === "Images must be 2 MB or smaller.",
    `${hugePicture.status} ${JSON.stringify(hugePicture.body).slice(0, 200)}`
  );
  const hugePaste = await call("/api/admin/questions/import", {
    method: "POST",
    token,
    body: { csv: `subject,topic,question,correct_answer\n${"x".repeat(6 * 1024 * 1024)}` }
  });
  check(
    "so is a paste over the limit",
    hugePaste.status === 413 && hugePaste.body.code === "too-large",
    `${hugePaste.status} ${JSON.stringify(hugePaste.body).slice(0, 200)}`
  );

  section("Written answers");
  // Its own topic, so the checks below see only this question.
  const writtenTopic = `written-${Date.now()}`;
  const noGuide = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ topicId: writtenTopic, type: "open-ended", options: [], correctAnswer: "   " })
  });
  check("a written question needs a marking guide", noGuide.status === 400, `got ${noGuide.status}`);

  const writtenQuestion = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({
      topicId: writtenTopic,
      type: "open-ended",
      prompt: "Explain in your own words why 2x + 6 = 14 gives x = 4.",
      options: [],
      correctAnswer: "1 mark: subtracts 6 from both sides. 1 mark: divides by 2.",
      marks: 2
    })
  });
  check("a written question saves", writtenQuestion.status === 201, JSON.stringify(writtenQuestion.body));
  check("and keeps its marking guide", writtenQuestion.body.question?.correctAnswer?.startsWith("1 mark"));

  // Whether the API has an AI marker decides whether the question is served.
  // Asking it, rather than assuming, keeps this right whichever way it runs.
  const writtenMarking = (await call("/api/admin/questions", { token })).body.writtenMarking === true;
  const writtenCatalog = await call("/api/catalog");
  const writtenTotal =
    (writtenCatalog.body.subjects ?? [])
      .find((subject) => subject.id === "math")
      ?.topics.find((topic) => topic.id === writtenTopic)?.total ?? 0;
  const writtenTest = await call("/api/tests/generate", {
    method: "POST",
    body: {
      studentKey,
      subjectId: "math",
      topicIds: [writtenTopic],
      difficultyMode: "custom",
      questionCount: 5,
      timeLimitMinutes: null
    }
  });

  if (writtenMarking) {
    check("with a marker, a written question is counted in the catalog", writtenTotal === 1, `total ${writtenTotal}`);
    check(
      "and is put in tests",
      writtenTest.status === 200 && writtenTest.body.test?.questions?.[0]?.type === "open-ended",
      `got ${writtenTest.status}: ${JSON.stringify(writtenTest.body)}`
    );
  } else {
    check("without a marker, a written question is not counted in the catalog", writtenTotal === 0, `total ${writtenTotal}`);
    check("and is never put in a test", writtenTest.status === 409, `got ${writtenTest.status}`);
  }

  section("Maths in the student's language");
  // Its own topic, so the papers below hold only these questions. English is
  // the question's own text and Russian its translation, the way the maths
  // bank is stored.
  const languageTopic = `language-${Date.now()}`;
  const circle = mcq({
    topicId: languageTopic,
    prompt: "Find the radius of a circle whose circumference is 32π cm.",
    options: ["8 cm", "16 cm", "32 cm", "64 cm"],
    correctAnswer: "16 cm",
    explanation: "The circumference is 2πr, so r = 16.",
    translations: {
      ru: {
        prompt: "Найдите радиус окружности, длина которой равна 32π см.",
        options: ["8 см", "16 см", "32 см", "64 см"],
        explanation: "Длина окружности равна 2πr, поэтому r = 16."
      }
    }
  });

  const wrongLength = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ topicId: languageTopic, translations: { ru: { prompt: "Вопрос", options: ["а", "б"] } } })
  });
  check(
    "translated options have to match the question's, one for one",
    wrongLength.status === 400 && /Russian translation has 2 options but the question has 4/.test(wrongLength.body.message),
    JSON.stringify(wrongLength.body)
  );

  const unknownLanguage = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ topicId: languageTopic, translations: { de: { prompt: "Frage" } } })
  });
  check("a language the site does not have is refused", unknownLanguage.status === 400, `got ${unknownLanguage.status}`);

  const translatedEnglish = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ subjectId: "english", topicId: languageTopic, translations: { ru: { prompt: "Вопрос" } } })
  });
  check(
    "an English question cannot be given a translation",
    translatedEnglish.status === 400,
    `got ${translatedEnglish.status}: ${JSON.stringify(translatedEnglish.body)}`
  );

  const circleSaved = await call("/api/admin/questions", { method: "POST", token, body: circle });
  check("a maths question with a Russian translation saves", circleSaved.status === 201, JSON.stringify(circleSaved.body));
  check(
    "and its translations come back",
    circleSaved.body.question?.translations?.ru?.options?.[1] === "16 см",
    JSON.stringify(circleSaved.body.question?.translations)
  );
  const circleId = circleSaved.body.question?.id;

  const perimeterSaved = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({
      topicId: languageTopic,
      type: "short-answer",
      prompt: "A square has sides of 6.5 cm. What is its perimeter?",
      options: [],
      correctAnswer: "26 cm",
      translations: { ru: { prompt: "Сторона квадрата равна 6,5 см. Найдите его периметр.", correctAnswer: "26 см" } }
    })
  });
  check("a short answer with a translated answer saves", perimeterSaved.status === 201, JSON.stringify(perimeterSaved.body));
  const perimeterId = perimeterSaved.body.question?.id;

  const englishSaved = await call("/api/admin/questions", {
    method: "POST",
    token,
    body: mcq({ subjectId: "english", topicId: languageTopic, prompt: "Choose the correct form: She ___ to school.", options: ["go", "goes"], correctAnswer: "goes" })
  });
  check("an English question saves without translations", englishSaved.status === 201, JSON.stringify(englishSaved.body));

  const generateIn = (subjectId, language) =>
    call("/api/tests/generate", {
      method: "POST",
      body: {
        studentKey,
        subjectId,
        topicIds: [languageTopic],
        difficultyMode: "custom",
        questionCount: 5,
        timeLimitMinutes: null,
        ...(language ? { language } : {})
      }
    });
  const servedQuestion = (response, id) => response.body.test?.questions?.find((question) => question.id === id);

  const inRussian = await generateIn("math", "ru");
  const inEnglish = await generateIn("math", "en");
  const inAzerbaijani = await generateIn("math", "az");
  const inNothing = await generateIn("math");
  check("tests generate in each language", [inRussian, inEnglish, inAzerbaijani, inNothing].every((r) => r.status === 200));

  const ruCircle = servedQuestion(inRussian, circleId);
  check(
    "Russian students are served the Russian text and options",
    ruCircle?.prompt.startsWith("Найдите радиус") && ruCircle.options[1] === "16 см",
    JSON.stringify(ruCircle)
  );
  check(
    "English students are served the English text and options",
    servedQuestion(inEnglish, circleId)?.prompt.startsWith("Find the radius") &&
      servedQuestion(inEnglish, circleId)?.options[1] === "16 cm"
  );
  check(
    "Azerbaijani has no translations yet, so it falls back to the question's own text",
    servedQuestion(inAzerbaijani, circleId)?.prompt.startsWith("Find the radius")
  );
  check("so does a test with no language", servedQuestion(inNothing, circleId)?.prompt.startsWith("Find the radius"));
  check(
    "the answer and the translated explanation are never sent to the student",
    inRussian.body.test.questions.every((question) => question.correctAnswer === undefined && question.explanation === undefined && question.translations === undefined)
  );

  // The same choice, one language each: the second option, "16 cm" and "16 см".
  const submit = (paper, answers) =>
    call(`/api/tests/${paper.body.test.id}/submit`, {
      method: "POST",
      body: { studentKey, answers, timeTakenSeconds: 5 }
    });

  const russianResult = await submit(inRussian, [
    { questionId: circleId, answer: "16 см" },
    { questionId: perimeterId, answer: "26 см" }
  ]);
  const englishResult = await submit(inEnglish, [
    { questionId: circleId, answer: "16 cm" },
    { questionId: perimeterId, answer: "26 cm" }
  ]);
  check(
    "the right choice and the right short answer mark correct in Russian",
    russianResult.body.score === 2,
    `score ${russianResult.body.score}: ${JSON.stringify(russianResult.body.reviews)}`
  );
  check(
    "and in English",
    englishResult.body.score === 2,
    `score ${englishResult.body.score}: ${JSON.stringify(englishResult.body.reviews)}`
  );
  const ruReview = russianResult.body.reviews?.find((review) => review.questionId === circleId);
  check(
    "the Russian result reviews the question as it was served",
    ruReview?.prompt.startsWith("Найдите радиус") &&
      ruReview.correctAnswer === "16 см" &&
      ruReview.explanation.startsWith("Длина окружности"),
    JSON.stringify(ruReview)
  );

  const inRussianAgain = await generateIn("math", "ru");
  const crossed = await submit(inRussianAgain, [
    { questionId: circleId, answer: "16 cm" },
    { questionId: perimeterId, answer: "26 cm" }
  ]);
  check(
    "English wording is not right on a Russian paper, which never offered it",
    crossed.body.score === 0,
    `score ${crossed.body.score}`
  );

  // The paper the student sat is a copy: editing the translation afterwards
  // must not change what they are shown when they look back at it.
  await call(`/api/admin/questions/${circleId}`, {
    method: "PUT",
    token,
    body: { ...circle, translations: { ru: { prompt: "Изменено.", options: ["а", "б", "в", "г"] } } }
  });
  const reopened = await call(`/api/tests/attempts/${inRussian.body.test.id}?studentKey=${encodeURIComponent(studentKey)}`);
  const reopenedCircle = reopened.body.reviews?.find((review) => review.questionId === circleId);
  check(
    "reopening a past paper shows it as it was served, even after the translation is edited",
    reopenedCircle?.prompt.startsWith("Найдите радиус") && reopenedCircle.options[1] === "16 см" && reopenedCircle.correctAnswer === "16 см",
    JSON.stringify(reopenedCircle)
  );

  const englishInRussian = await generateIn("english", "ru");
  const englishInEnglish = await generateIn("english", "en");
  const sameQuestion = (paper) => JSON.stringify(servedQuestion(paper, englishSaved.body.question?.id));
  check(
    "an English question is the same whichever language the site is in",
    englishInRussian.status === 200 && sameQuestion(englishInRussian) === sameQuestion(englishInEnglish) && sameQuestion(englishInRussian).includes("She ___ to school"),
    sameQuestion(englishInRussian)
  );

  const badLanguage = await call("/api/tests/generate", {
    method: "POST",
    body: { studentKey, subjectId: "math", topicIds: [languageTopic], difficultyMode: "easy", language: "de" }
  });
  check("a language the site does not have is refused when creating a test", badLanguage.status === 400, `got ${badLanguage.status}`);

  const importedTranslations = await call("/api/admin/questions/import", {
    method: "POST",
    token,
    body: {
      csv: [
        "subject,topic,question,option_a,option_b,correct_answer,question_ru,option_a_ru,option_b_ru",
        `math,${languageTopic}-import,Which is bigger?,3,5,B,Что больше?,3,5`
      ].join("\n")
    }
  });
  check(
    "a sheet with Russian columns imports them as translations",
    importedTranslations.body.questions?.[0]?.translations?.ru?.prompt === "Что больше?",
    JSON.stringify(importedTranslations.body)
  );

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
