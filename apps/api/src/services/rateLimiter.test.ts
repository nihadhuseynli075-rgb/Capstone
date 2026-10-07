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
