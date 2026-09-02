import { useEffect, useRef } from "react";
import { getGuestKey, hasGuestHistory } from "../../lib/studentKey";
import { claimGuestHistory } from "../../services/testsApi";
import { useAuth } from "./AuthContext";

const CLAIMED_KEY = "examPeak.historyClaimed";

/**
 * Moves tests taken before signing up onto the new account.
 *
 * Someone can try the app as a guest, like it, and make an account. Their
 * attempts are stored against the browser's guest key, so without this they
 * would appear to lose everything at the moment they signed up. One call after
 * the first sign-in reassigns them.
 *
 * The result is recorded in local storage so this runs once per browser per
 * account rather than on every page load. It is deliberately quiet: if the
 * claim fails, the tests are still there under the guest key and the next sign
 * in tries again.
 */
export function useHistoryClaim(): void {
  const { user } = useAuth();
  const running = useRef(false);

  useEffect(() => {
    if (!user || running.current) return;
    if (!hasGuestHistory()) return;

    const guestKey = getGuestKey();
    // Nothing to move if the guest key is already this account's id.
    if (guestKey === user.id) return;

    const marker = `${CLAIMED_KEY}.${user.id}`;
    if (window.localStorage.getItem(marker) === guestKey) return;

    running.current = true;

    claimGuestHistory(guestKey)
      .then(() => {
        window.localStorage.setItem(marker, guestKey);
      })
      .catch(() => {
        // Left for the next sign-in to retry.
      })
      .finally(() => {
        running.current = false;
      });
  }, [user]);
}
