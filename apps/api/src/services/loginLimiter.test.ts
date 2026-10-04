import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createLoginLimiter } from "./loginLimiter";

const MINUTE = 60_000;

/** A limiter on a clock the test moves by hand: ten wrong passwords in fifteen minutes, then fifteen minutes out. */
function limiterAt(start = 1_000_000) {
  let time = start;
  const limiter = createLoginLimiter({ maxFailures: 10, windowMs: 15 * MINUTE, lockoutMs: 15 * MINUTE, now: () => time });
  return {
    limiter,
    advance(ms: number) {
      time += ms;
    }
  };
}

function fail(limiter: ReturnType<typeof createLoginLimiter>, address: string, times: number) {
  for (let index = 0; index < times; index += 1) limiter.recordFailure(address);
}

describe("createLoginLimiter", () => {
  test("nine wrong passwords still leave the door open", () => {
    const { limiter } = limiterAt();
    fail(limiter, "1.2.3.4", 9);
    assert.equal(limiter.waitFor("1.2.3.4"), 0);
  });

  test("the tenth shuts the address out for fifteen minutes", () => {
    const { limiter, advance } = limiterAt();
    fail(limiter, "1.2.3.4", 10);
    assert.equal(limiter.waitFor("1.2.3.4"), 15 * MINUTE);

    advance(14 * MINUTE);
    assert.equal(limiter.waitFor("1.2.3.4"), MINUTE);

    advance(MINUTE);
    assert.equal(limiter.waitFor("1.2.3.4"), 0);
  });

  test("only the address that guessed is shut out", () => {
    const { limiter } = limiterAt();
    fail(limiter, "1.2.3.4", 10);
    assert.equal(limiter.waitFor("5.6.7.8"), 0);
  });

  test("wrong passwords spread over more than fifteen minutes do not add up", () => {
    const { limiter, advance } = limiterAt();
    fail(limiter, "1.2.3.4", 9);
    advance(16 * MINUTE);
    fail(limiter, "1.2.3.4", 1);
    assert.equal(limiter.waitFor("1.2.3.4"), 0);
  });

  test("a right password clears the count", () => {
    const { limiter } = limiterAt();
    fail(limiter, "1.2.3.4", 9);
    limiter.recordSuccess("1.2.3.4");
    fail(limiter, "1.2.3.4", 9);
    assert.equal(limiter.waitFor("1.2.3.4"), 0);
  });

  test("after the pause the count starts again from nothing", () => {
    const { limiter, advance } = limiterAt();
    fail(limiter, "1.2.3.4", 10);
    advance(15 * MINUTE);
    fail(limiter, "1.2.3.4", 1);
    assert.equal(limiter.waitFor("1.2.3.4"), 0);
  });
});
