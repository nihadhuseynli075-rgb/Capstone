/**
 * Whose a record kept in the browser tab is.
 *
 * The result of the last test and the paper in progress live in the tab's
 * session storage, which a sign out does not empty. So each is stamped with who
 * it was saved for, and what the tab shows is decided by that stamp rather than
 * by whatever happens to be there. The rules sit here, apart from the storage
 * calls around them, so they can be tested without a browser.
 */

export interface TabIdentity {
  /** The signed-in account's id, or null while signed out. */
  userId: string | null;
  /**
   * This browser's guest key, or null when it has none. A key whose tests were
   * moved onto an account counts as none: it owns nothing now, so a record
   * stamped with it is not a guest's to see.
   */
  guestKey: string | null;
}

/**
 * What to do with a stored record.
 *
 * - keep: it is this tab's own.
 * - hand-over: a guest's record, found after that guest has signed in. Their
 *   history is moved onto the account at the same moment (see useHistoryClaim),
 *   so the record becomes the account's and is stamped again.
 * - drop: it is someone else's, or says nobody's.
 */
export type StoredRecordFate = "keep" | "hand-over" | "drop";

export function storedRecordFate(owner: unknown, who: TabIdentity): StoredRecordFate {
  // A record from before records were stamped could be anyone's. Showing it
  // would be a guess, and a wrong guess shows one student another's answers.
  if (typeof owner !== "string" || owner.length === 0) return "drop";

  if (who.userId !== null) {
    if (owner === who.userId) return "keep";
    if (who.guestKey !== null && owner === who.guestKey) return "hand-over";
    return "drop";
  }

  return who.guestKey !== null && owner === who.guestKey ? "keep" : "drop";
}

/** The stamp for a record saved now, or null when the tab has no identity to stamp it with. */
export function recordOwner(who: TabIdentity): string | null {
  return who.userId ?? who.guestKey;
}
