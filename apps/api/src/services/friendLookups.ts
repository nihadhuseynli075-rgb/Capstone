import type { User } from "@supabase/supabase-js";
import { createRateLimiter } from "./rateLimiter";

/**
 * Looking a student up to ask them to be friends: how often it may be done,
 * and which accounts it can find.
 *
 * A request names an email address or a username and is answered with
 * whether an account is behind it, and if so its name, username and photo
 * (see sendRequest). For one student finding a classmate, that plain answer
 * is the point of the box. Asked by a script, the same answer sorts any list
 * of addresses into "has an account" and "has not", names and photos
 * included. The limits are what stop that, and leaving out accounts that
 * have not confirmed their email stops a sign-up made with somebody else's
 * address from being found under it.
 */

const HOUR = 60 * 60 * 1000;

/**
 * Lookups one account may make in an hour. A student adding their class one
 * at a time, a few typos included, stays well inside it.
 */
export const LOOKUPS_PER_ACCOUNT = 30;

/**
 * Lookups from one address in an hour, whichever accounts make them. A school
 * shares one address: 30 students adding ten classmates each is 300. It is
 * what stops a script getting round the account limit by making more
 * accounts: from one address, ten accounts' worth is all there is. Behind a
 * host's proxy the address is only the student's own once TRUST_PROXY is set
 * (see env.ts).
 */
export const LOOKUPS_PER_ADDRESS = 300;

export interface LookupLimiter {
  /**
   * Counts a lookup by this account from this address. Answers 0 when it may
   * go ahead, or how long in milliseconds until it would be allowed.
   */
  take(accountId: string, address: string): number;
}

export function createLookupLimiter({ now }: { now?: () => number } = {}): LookupLimiter {
  const byAccount = createRateLimiter({ maxRequests: LOOKUPS_PER_ACCOUNT, windowMs: HOUR, now });
  const byAddress = createRateLimiter({ maxRequests: LOOKUPS_PER_ADDRESS, windowMs: HOUR, now });

  return {
    take(accountId, address) {
      // The account first, and the address only once the account may go
      // ahead. A refused request is not counted, so one student pressing the
      // button over and over uses up their own allowance, not their school's.
      // The other way round, a lookup refused because the whole address is
      // over its limit has already been counted against the account; that
      // only happens while the address is shut anyway.
      return byAccount.take(accountId) || byAddress.take(address);
    }
  };
}

/**
 * Whether a lookup may find this account: only once it has shown it owns its
 * email address.
 *
 * Supabase sets `email_confirmed_at` when the link in the sign-up email is
 * opened, straight away when the project has "Confirm email" off, and on a
 * sign-in with Google, which vouches for its own addresses. Until then the
 * account is only somebody's claim to the address. Anyone can sign up with a
 * classmate's email and a name of their choosing, and the sign-up trigger
 * (0002, as 0007 leaves it) makes the profile at that moment, so a lookup
 * would otherwise find that name under the classmate's address before the
 * classmate had any say.
 */
export function canBeFound(user: Pick<User, "email_confirmed_at"> | null | undefined): boolean {
  return typeof user?.email_confirmed_at === "string" && user.email_confirmed_at.length > 0;
}
