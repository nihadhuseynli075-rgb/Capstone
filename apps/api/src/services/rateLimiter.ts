/**
 * Requests counted per address over a sliding window.
 *
 * Generating a test needs no account and writes the attempt plus a row for
 * every question served, so without a limit one script could fill the
 * database as fast as it could send requests. Unlike the admin login limiter
 * (see loginLimiter), every request counts here, not only failures, and an
 * address is let back in as soon as its oldest request leaves the window.
 *
 * The same limiter counts written answers sent to the AI marker, per student
 * and per address (see the submit route). One hand-in can carry several, so
 * a request can count as more than one.
 *
 * Kept in memory, so a restart forgets it, which is fine at this size. The
 * clock is passed in so the rules can be tested without waiting.
 */

export interface RateLimiterOptions {
  /** Requests allowed from one address within `windowMs`. */
  maxRequests: number;
  windowMs: number;
  now?: () => number;
}

export interface RateLimiter {
  /**
   * Counts a request from this address, or `cost` of them at once (a whole
   * number, one unless given). Answers 0 when it may go ahead, or how long in
   * milliseconds until it would be allowed, in which case none of it is
   * counted: all of it fits, or nothing is taken. A cost larger than the limit
   * itself never fits, and answers Infinity.
   */
  take(address: string, cost?: number): number;
}

export function createRateLimiter({ maxRequests, windowMs, now = Date.now }: RateLimiterOptions): RateLimiter {
  const entries = new Map<string, number[]>();
  let lastSweep = 0;

  /** Forgets addresses with nothing left in the window, so the map cannot grow without end. */
  function sweep(at: number): void {
    if (at - lastSweep < windowMs) return;
    lastSweep = at;
    for (const [address, times] of entries) {
      if (times.every((time) => at - time >= windowMs)) entries.delete(address);
    }
  }

  return {
    take(address, cost = 1) {
      const at = now();
      sweep(at);

      const recent = (entries.get(address) ?? []).filter((time) => at - time < windowMs);

      if (cost > maxRequests) {
        entries.set(address, recent);
        return Number.POSITIVE_INFINITY;
      }

      // Refused whole rather than in part: a hand-in either has all of its
      // written answers marked or none of them.
      if (recent.length + cost > maxRequests) {
        entries.set(address, recent);
        // Oldest first, so the wait is until enough of the oldest have left
        // the window to make room for all of it.
        return recent[recent.length + cost - maxRequests - 1] + windowMs - at;
      }

      for (let taken = 0; taken < cost; taken += 1) recent.push(at);
      entries.set(address, recent);
      return 0;
    }
  };
}
