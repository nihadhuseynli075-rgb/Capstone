import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LOOKUPS_PER_ACCOUNT, LOOKUPS_PER_ADDRESS, canBeFound, createLookupLimiter } from "./friendLookups";

const MINUTE = 60_000;
const SCHOOL = "203.0.113.7";

/** A limiter on a clock the test moves by hand. */
function limiterAt(start = 1_000_000) {
  let time = start;
  const limiter = createLookupLimiter({ now: () => time });
  return {
    limiter,
    advance(ms: number) {
      time += ms;
    }
  };
}

/** Looks up `times` times as one account, and returns how many went ahead. */
function lookUp(limiter: ReturnType<typeof createLookupLimiter>, account: string, times: number, address = SCHOOL) {
  let allowed = 0;
  for (let index = 0; index < times; index += 1) {
    if (limiter.take(account, address) === 0) allowed += 1;
  }
  return allowed;
}

describe("createLookupLimiter", () => {
  test("the limits are 30 an hour for an account and 300 for an address", () => {
    assert.equal(LOOKUPS_PER_ACCOUNT, 30);
    assert.equal(LOOKUPS_PER_ADDRESS, 300);
  });

  test("an account may look up 30 people in an hour, and is then told how long to wait", () => {
    const { limiter, advance } = limiterAt();
    assert.equal(lookUp(limiter, "ana", 10), 10);
    advance(20 * MINUTE);
    assert.equal(lookUp(limiter, "ana", 20), 20);

    // The first ten leave the hour 40 minutes from now.
    assert.equal(limiter.take("ana", SCHOOL), 40 * MINUTE);

    advance(40 * MINUTE);
    assert.equal(lookUp(limiter, "ana", 11), 10);
  });

  test("one account at its limit leaves its classmates on the same address free", () => {
    const { limiter } = limiterAt();
    lookUp(limiter, "ana", 30);
    assert.equal(limiter.take("ben", SCHOOL), 0);
  });

  test("the same account is limited from any address", () => {
    const { limiter } = limiterAt();
    lookUp(limiter, "ana", 30);
    assert.equal(limiter.take("ana", "198.51.100.1") > 0, true);
  });

  test("an address may make 300 lookups in an hour, whichever accounts make them", () => {
    const { limiter } = limiterAt();
    for (let account = 0; account < 10; account += 1) {
      assert.equal(lookUp(limiter, `student-${account}`, 30), 30);
    }

    // An eleventh account, fresh, is still refused: it is the address that is full.
    assert.equal(limiter.take("student-10", SCHOOL) > 0, true);
    assert.equal(limiter.take("student-10", "198.51.100.1"), 0);
  });

  test("lookups refused for the account are not counted against the address", () => {
    const { limiter } = limiterAt();
    // One student pressing the button a thousand times...
    assert.equal(lookUp(limiter, "ana", 1000), 30);

    // ...leaves the other 270 lookups for everybody else.
    let others = 0;
    for (let account = 0; account < 9; account += 1) others += lookUp(limiter, `student-${account}`, 30);
    assert.equal(others, 270);
    assert.equal(limiter.take("student-9", SCHOOL) > 0, true);
  });

  test("an hour later, everyone may look people up again", () => {
    const { limiter, advance } = limiterAt();
    for (let account = 0; account < 10; account += 1) lookUp(limiter, `student-${account}`, 30);
    advance(60 * MINUTE);
    assert.equal(lookUp(limiter, "student-0", 30), 30);
  });
});

describe("canBeFound", () => {
  test("an account that has confirmed its email", () => {
    assert.equal(canBeFound({ email_confirmed_at: "2026-10-14T09:00:00Z" }), true);
  });

  test("not one still waiting for its sign-up link", () => {
    // GoTrue sends null; older versions left the field out altogether.
    assert.equal(canBeFound({ email_confirmed_at: null as unknown as string }), false);
    assert.equal(canBeFound({}), false);
    assert.equal(canBeFound({ email_confirmed_at: "" }), false);
  });

  test("not an account that is not there", () => {
    assert.equal(canBeFound(null), false);
    assert.equal(canBeFound(undefined), false);
  });
});
