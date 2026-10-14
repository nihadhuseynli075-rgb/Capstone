import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createRateLimiter } from "./rateLimiter";

const MINUTE = 60_000;

/** A limiter on a clock the test moves by hand: three requests in ten minutes. */
function limiterAt(start = 1_000_000) {
  let time = start;
  const limiter = createRateLimiter({ maxRequests: 3, windowMs: 10 * MINUTE, now: () => time });
  return {
    limiter,
    advance(ms: number) {
      time += ms;
    }
  };
}

describe("createRateLimiter", () => {
  test("requests up to the limit go ahead", () => {
    const { limiter } = limiterAt();
    assert.equal(limiter.take("1.2.3.4"), 0);
    assert.equal(limiter.take("1.2.3.4"), 0);
    assert.equal(limiter.take("1.2.3.4"), 0);
  });

  test("one more is refused until the oldest leaves the window", () => {
    const { limiter, advance } = limiterAt();
    limiter.take("1.2.3.4");
    advance(4 * MINUTE);
    limiter.take("1.2.3.4");
    limiter.take("1.2.3.4");

    assert.equal(limiter.take("1.2.3.4"), 6 * MINUTE);

    advance(6 * MINUTE);
    assert.equal(limiter.take("1.2.3.4"), 0);
    // The two from minute four are still in the window, plus the one just let in.
    assert.equal(limiter.take("1.2.3.4") > 0, true);
  });

  test("a refused request is not counted against the address", () => {
    const { limiter, advance } = limiterAt();
    for (let index = 0; index < 3; index += 1) limiter.take("1.2.3.4");
    for (let index = 0; index < 20; index += 1) limiter.take("1.2.3.4");

    advance(10 * MINUTE);
    assert.equal(limiter.take("1.2.3.4"), 0);
  });

  test("each address has its own count", () => {
    const { limiter } = limiterAt();
    for (let index = 0; index < 3; index += 1) limiter.take("1.2.3.4");
    assert.equal(limiter.take("5.6.7.8"), 0);
  });
});

describe("createRateLimiter with a cost", () => {
  test("a cost counts as that many requests", () => {
    const { limiter } = limiterAt();
    assert.equal(limiter.take("1.2.3.4", 2), 0);
    assert.equal(limiter.take("1.2.3.4"), 0);
    assert.equal(limiter.take("1.2.3.4") > 0, true);
  });

  test("a cost that does not fit is refused whole, and none of it is counted", () => {
    const { limiter } = limiterAt();
    assert.equal(limiter.take("1.2.3.4", 2), 0);

    // One is left, so two are refused rather than one of them let through.
    assert.equal(limiter.take("1.2.3.4", 2) > 0, true);
    // And that refusal used up nothing: the one left is still there.
    assert.equal(limiter.take("1.2.3.4"), 0);
  });

  test("the wait is until enough of the oldest have left the window for all of it", () => {
    const { limiter, advance } = limiterAt();
    limiter.take("1.2.3.4");
    advance(2 * MINUTE);
    limiter.take("1.2.3.4");
    advance(2 * MINUTE);
    limiter.take("1.2.3.4");

    // Two need room: the one from minute 0 leaving is not enough, the one
    // from minute 2 has to go too, at minute 12.
    assert.equal(limiter.take("1.2.3.4", 2), 8 * MINUTE);

    advance(6 * MINUTE);
    assert.equal(limiter.take("1.2.3.4", 2) > 0, true);
    advance(2 * MINUTE);
    assert.equal(limiter.take("1.2.3.4", 2), 0);
  });

  test("more than the whole limit at once is never allowed, and takes nothing", () => {
    const { limiter } = limiterAt();
    assert.equal(limiter.take("1.2.3.4", 4), Number.POSITIVE_INFINITY);
    assert.equal(limiter.take("1.2.3.4", 3), 0);
  });
});
