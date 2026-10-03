import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  parseLookup,
  planRequest,
  sortFriendships,
  summariseProgress,
  type FriendshipRow,
  type SubmittedTest
} from "./friends";

const ME = "00000000-0000-4000-8000-00000000000a";
const ANA = "00000000-0000-4000-8000-00000000000b";
const BEN = "00000000-0000-4000-8000-00000000000c";

let counter = 0;

function row(userId: string, friendId: string, status: FriendshipRow["status"] = "pending"): FriendshipRow {
  counter += 1;
  return {
    id: `row-${counter}`,
    userId,
    friendId,
    status,
    createdAt: new Date(2026, 8, counter).toISOString(),
    respondedAt: status === "pending" ? null : new Date(2026, 8, counter).toISOString()
  };
}

function testWith(overrides: Partial<SubmittedTest>): SubmittedTest {
  return {
    score: 5,
    totalMarks: 10,
    totalQuestions: 10,
    percentage: 50,
    difficultyMode: "easy",
    submittedAt: "2026-09-20T10:00:00+00:00",
    ...overrides
  };
}

describe("parseLookup", () => {
  test("an email address, in any case and with stray spaces", () => {
    assert.deepEqual(parseLookup("  Ana.B@School.Example "), { by: "email", email: "ana.b@school.example" });
  });

  test("a username, with or without the @ it is printed with", () => {
    assert.deepEqual(parseLookup("ana_b"), { by: "username", username: "ana_b" });
    assert.deepEqual(parseLookup("@Ana_B"), { by: "username", username: "ana_b" });
  });

  test("an @ and then something that looks like a domain is still a username when nothing comes before it", () => {
    // Usernames may contain dots, so this is not "an address with no name".
    assert.deepEqual(parseLookup("@ana.b"), { by: "username", username: "ana.b" });
  });

  test("only one leading @ is dropped", () => {
    assert.deepEqual(parseLookup("@@ana"), { by: "username", username: "@ana" });
  });

  test("an address with no domain is not an email, and so is looked up as a username that will not exist", () => {
    assert.deepEqual(parseLookup("ana@school"), { by: "username", username: "ana@school" });
  });

  test("nothing, or something with spaces in it, is neither", () => {
    assert.equal(parseLookup("   "), null);
    assert.equal(parseLookup("@"), null);
    assert.equal(parseLookup("ana b"), null);
  });
});

describe("planRequest", () => {
  test("two students with nothing between them: make the request", () => {
    assert.deepEqual(planRequest([], ME, ANA), { action: "create" });
  });

  test("rows about somebody else are not about this pair", () => {
    assert.deepEqual(planRequest([row(ME, BEN), row(BEN, ANA, "accepted")], ME, ANA), { action: "create" });
  });

  test("a request already sent is not sent twice", () => {
    assert.deepEqual(planRequest([row(ME, ANA)], ME, ANA), { action: "refuse", reason: "already-requested" });
  });

  test("somebody who has already asked me: accept theirs rather than make a second row", () => {
    const theirs = row(ANA, ME);
    assert.deepEqual(planRequest([theirs], ME, ANA), { action: "accept-theirs", theirs });
  });

  test("friends already, whichever of them asked first", () => {
    assert.deepEqual(planRequest([row(ME, ANA, "accepted")], ME, ANA), { action: "refuse", reason: "already-friends" });
    assert.deepEqual(planRequest([row(ANA, ME, "accepted")], ME, ANA), { action: "refuse", reason: "already-friends" });
  });

  test("a blocked row refuses from both sides", () => {
    assert.deepEqual(planRequest([row(ANA, ME, "blocked")], ME, ANA), { action: "refuse", reason: "blocked" });
    assert.deepEqual(planRequest([row(ME, ANA, "blocked")], ME, ANA), { action: "refuse", reason: "blocked" });
  });

  test("being friends outranks a leftover request", () => {
    const rows = [row(ANA, ME), row(ME, ANA, "accepted")];
    assert.deepEqual(planRequest(rows, ME, ANA), { action: "refuse", reason: "already-friends" });
  });
});

describe("sortFriendships", () => {
  test("splits accepted, incoming and outgoing", () => {
    const friend = row(ANA, ME, "accepted");
    const incoming = row(BEN, ME);
    const other = "00000000-0000-4000-8000-00000000000d";
    const outgoing = row(ME, other);

    assert.deepEqual(sortFriendships([friend, incoming, outgoing], ME), {
      friends: [friend],
      incoming: [incoming],
      outgoing: [outgoing]
    });
  });

  test("blocked rows are not shown anywhere", () => {
    assert.deepEqual(sortFriendships([row(ANA, ME, "blocked"), row(ME, BEN, "blocked")], ME), {
      friends: [],
      incoming: [],
      outgoing: []
    });
  });

  test("two requests aimed at each other show as the one to answer", () => {
    const mine = row(ME, ANA);
    const theirs = row(ANA, ME);
    const sorted = sortFriendships([mine, theirs], ME);

    assert.deepEqual(sorted.incoming, [theirs]);
    assert.deepEqual(sorted.outgoing, []);
  });

  test("a request left beside an accepted row is hidden", () => {
    const accepted = row(ANA, ME, "accepted");
    const sorted = sortFriendships([row(ME, ANA), accepted], ME);

    assert.deepEqual(sorted.friends, [accepted]);
    assert.deepEqual(sorted.outgoing, []);
    assert.deepEqual(sorted.incoming, []);
  });

  test("one person is listed once", () => {
    const first = row(ME, ANA, "accepted");
    const sorted = sortFriendships([first, row(ANA, ME, "accepted")], ME);
    assert.deepEqual(sorted.friends, [first]);
  });
});

describe("summariseProgress", () => {
  test("a student with no tests has nothing to show, rather than zeros that read as scores", () => {
    assert.deepEqual(summariseProgress([]), { testsTaken: 0, best: null, averagePercentage: null, lastActiveAt: null });
  });

  test("counts the tests, averages the percentages and finds the latest", () => {
    const progress = summariseProgress([
      testWith({ percentage: 80, submittedAt: "2026-09-01T09:00:00+00:00" }),
      testWith({ percentage: 55, submittedAt: "2026-09-12T09:00:00.250000+00:00" }),
      testWith({ percentage: 60, submittedAt: "2026-09-12T09:00:00+00:00" })
    ]);

    assert.equal(progress.testsTaken, 3);
    assert.equal(progress.averagePercentage, 65);
    assert.equal(progress.lastActiveAt, "2026-09-12T09:00:00.250000+00:00");
  });

  test("the average is to one decimal place", () => {
    const progress = summariseProgress([testWith({ percentage: 66.7 }), testWith({ percentage: 50 }), testWith({ percentage: 50 })]);
    assert.equal(progress.averagePercentage, 55.6);
  });

  test("best is the history page's measure, not the highest percentage", () => {
    // 10/10 on a short easy test against 45/50 on a long hard one.
    const progress = summariseProgress([
      testWith({ score: 10, totalMarks: 10, totalQuestions: 10, percentage: 100, difficultyMode: "easy" }),
      testWith({ score: 45, totalMarks: 50, totalQuestions: 50, percentage: 90, difficultyMode: "hard" })
    ]);

    assert.deepEqual(progress.best, { score: 45, totalMarks: 50, percentage: 90 });
  });

  test("a tie goes to the newer test, as on the history page", () => {
    const progress = summariseProgress([
      testWith({ score: 7, percentage: 70, submittedAt: "2026-09-01T09:00:00+00:00" }),
      testWith({ score: 8, percentage: 70, submittedAt: "2026-09-05T09:00:00+00:00" })
    ]);

    assert.equal(progress.best?.score, 8);
  });
});
