/**
 * Requests counted per address over a sliding window.
 *
 * Generating a test needs no account and writes the attempt plus a row for
 * every question served, so without a limit one script could fill the
 * database as fast as it could send requests. Unlike the admin login limiter
 * (see loginLimiter), every request counts here, not only failures, and an
 * address is let back in as soon as its oldest request leaves the window.
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
   * Counts a request from this address. Answers 0 when it may go ahead, or how
   * long in milliseconds until it would be allowed, in which case it is not
   * counted.
   */
  take(address: string): number;
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
    take(address) {
      const at = now();
      sweep(at);

      const recent = (entries.get(address) ?? []).filter((time) => at - time < windowMs);

      if (recent.length >= maxRequests) {
        entries.set(address, recent);
        return recent[0] + windowMs - at;
      }

      recent.push(at);
      entries.set(address, recent);
      return 0;
    }
  };
}
