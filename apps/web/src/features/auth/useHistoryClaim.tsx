import { useEffect, useRef } from "react";
import { isGuestKeyClaimed, markGuestKeyClaimed, peekGuestKey } from "../../lib/studentKey";
import { claimGuestHistory } from "../../services/testsApi";
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
 * guest key it gets a fresh one (see getGuestKey), so tests from a later spell
 * as a guest are under a key of their own and move at the next sign-in, instead
 * of being skipped because the account had claimed this browser once before.
 *
 * It is deliberately quiet: if the claim fails, the tests are still there under
 * the guest key and the next sign-in tries again.
 */
export function useHistoryClaim(): void {
  const { user } = useAuth();
  const running = useRef(false);

  useEffect(() => {
    if (!user || running.current) return;

    // No key means no test was ever taken here as a guest.
    const guestKey = peekGuestKey();
    if (!guestKey || guestKey === user.id || isGuestKeyClaimed(guestKey)) return;

    running.current = true;

    claimGuestHistory(guestKey)
      .then(() => {
        markGuestKeyClaimed(guestKey);
      })
      .catch(() => {
        // Left for the next sign-in to retry.
      })
      .finally(() => {
        running.current = false;
      });
  }, [user]);
}
