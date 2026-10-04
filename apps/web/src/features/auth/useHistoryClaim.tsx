import { useEffect, useRef } from "react";
import { isGuestKeyClaimed, markGuestKeyClaimed, peekGuestKey } from "../../lib/studentKey";
import { claimGuestHistory, isPassingClaimFailure } from "../../services/testsApi";
import { useAuth } from "./AuthContext";

/**
 * Moves tests taken before signing in onto the account.
 *
 * Someone can try the app as a guest, like it, and make an account. Their
 * attempts are stored against the browser's guest key, so without this they
 * would appear to lose everything at the moment they signed up. One call after
 * signing in reassigns them.
 *
 * Each guest key is claimed once and then recorded as claimed. That record is
 * kept per key rather than per account: the next time the browser needs a
 * guest key it gets a fresh one (see guestKey in lib/studentKey), so tests
 * from a later spell as a guest are under a key of their own and move at the
 * next sign-in, instead of being skipped because the account had claimed this
 * browser once before.
 *
 * It is deliberately quiet: if the claim fails, the tests are still there under
 * the guest key. A failure that may pass on its own (no connection, a server
 * error) is tried again a few more times while the same account stays signed
 * in, since the tab has already treated a paper sat as a guest as the
 * account's; anything else is left for the next sign-in.
 */
export function useHistoryClaim(): void {
  const { user } = useAuth();
  const running = useRef(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    let stopped = false;
    let retryTimer: number | undefined;

    const attempt = (retriesUsed: number) => {
      if (stopped || running.current) return;

      // No key means no test was ever taken here as a guest.
      const guestKey = peekGuestKey();
      if (!guestKey || guestKey === userId || isGuestKeyClaimed(guestKey)) return;

      running.current = true;

      claimGuestHistory(guestKey)
        .then(() => {
          markGuestKeyClaimed(guestKey);
        })
        .catch((cause: unknown) => {
          // claimGuestHistory has already retried briefly. A longer outage gets
          // a few more goes, further apart, as long as nobody else has signed in.
          if (stopped || !isPassingClaimFailure(cause) || retriesUsed >= LATER_RETRY_DELAYS_MS.length) return;
          retryTimer = window.setTimeout(() => attempt(retriesUsed + 1), LATER_RETRY_DELAYS_MS[retriesUsed]);
        })
        .finally(() => {
          running.current = false;
        });
    };

    attempt(0);

    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
    };
  }, [userId]);
}

/** Further claims after the quick retries have failed: a little over three minutes in all. */
const LATER_RETRY_DELAYS_MS = [10_000, 30_000, 60_000, 120_000];
