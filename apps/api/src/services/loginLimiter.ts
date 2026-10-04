/**
 * Wrong admin passwords, counted per address, with a pause after too many.
 *
 * The whole admin dashboard sits behind one shared password, so without a
 * limit it could be guessed online as fast as requests can be sent. Ten wrong
 * passwords in a quarter of an hour shuts that address out for the next
 * quarter of an hour, which is no hardship for an admin who mistyped and a
 * very slow guessing rate for anyone else.
 *
 * Kept in memory, like the admin sessions themselves (see adminAuth): a
 * restart forgets it, which is fine at this size. The clock is passed in so the
 * rules can be tested without waiting.
 */

export interface LoginLimiterOptions {
  /** Wrong passwords allowed within `windowMs` before the address is shut out. */
  maxFailures: number;
  windowMs: number;
  /** How long an address is shut out for once it reaches `maxFailures`. */
  lockoutMs: number;
  now?: () => number;
}

interface Entry {
  /** When each recent wrong password arrived. */
  failures: number[];
  /** Until when the address is shut out; 0 when it is not. */
  lockedUntil: number;
}

export interface LoginLimiter {
  /** How long, in milliseconds, this address must wait before trying again. 0 when it may try now. */
  waitFor(address: string): number;
  recordFailure(address: string): void;
  /** A right password clears the address's count. */
  recordSuccess(address: string): void;
}

export function createLoginLimiter({ maxFailures, windowMs, lockoutMs, now = Date.now }: LoginLimiterOptions): LoginLimiter {
  const entries = new Map<string, Entry>();

  /** Forgets addresses with nothing left to remember, so the map cannot grow without end. */
  function forgetSettled(at: number): void {
    for (const [address, entry] of entries) {
      entry.failures = entry.failures.filter((time) => at - time < windowMs);
      if (entry.failures.length === 0 && entry.lockedUntil <= at) entries.delete(address);
    }
  }

  return {
    waitFor(address) {
      const entry = entries.get(address);
      if (!entry) return 0;
      return Math.max(0, entry.lockedUntil - now());
    },

    recordFailure(address) {
      const at = now();
      forgetSettled(at);

      const entry = entries.get(address) ?? { failures: [], lockedUntil: 0 };
      entry.failures.push(at);

      // The count starts again once the pause is over, rather than one more
      // wrong password shutting the address out straight away.
      if (entry.failures.length >= maxFailures) {
        entry.lockedUntil = at + lockoutMs;
        entry.failures = [];
      }

      entries.set(address, entry);
    },

    recordSuccess(address) {
      entries.delete(address);
    }
  };
}
