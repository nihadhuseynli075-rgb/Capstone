import { useCallback, useEffect, useRef, useState } from "react";
import type { FriendsOverview } from "@grade9/shared";
import { useLanguage, type TranslationKey } from "../../lib/i18n";
import { ApiError } from "../../services/apiClient";
import { errorText } from "../profile/profileText";
import * as friendsApi from "../../services/friendsApi";
import { useAuth } from "../auth/AuthContext";

export type FriendsStatus =
  | "loading"
  | "ready"
  /** The API is running without Supabase, so it has no accounts to be friends with. */
  | "unavailable"
  | "error";

/** The API's refusal codes, and the words each one gets in the site language. */
const refusalText: Record<string, TranslationKey> = {
  "invalid-lookup": "friends.error.invalidLookup",
  yourself: "friends.error.yourself",
  "no-account": "friends.error.noAccount",
  "already-friends": "friends.error.alreadyFriends",
  "already-requested": "friends.error.alreadyRequested",
  blocked: "friends.error.blocked",
  gone: "friends.error.gone"
};

/**
 * The signed-in student's friends, kept in step with the server.
 *
 * Every change is followed by reading the whole list again rather than patching
 * it here: the server decides what a request came to (a request sent to
 * somebody who had already asked becomes a friendship), and the list is small.
 * It is read again when the tab is returned to as well, so a request sent from
 * another browser turns up without a reload.
 */
export function useFriends() {
  const { ready, user } = useAuth();
  const { t } = useLanguage();
  const userId = user?.id ?? null;

  const [overview, setOverview] = useState<FriendsOverview | null>(null);
  const [status, setStatus] = useState<FriendsStatus>("loading");
  /** Why the last read failed, worded by explain; null once one works. */
  const [error, setError] = useState<unknown>(null);

  // Reads can overlap, and an older answer arriving last must not win.
  const latestRead = useRef(0);

  const load = useCallback(async () => {
    const turn = (latestRead.current += 1);

    try {
      const next = await friendsApi.fetchFriends();
      if (turn !== latestRead.current) return;

      setOverview(next);
      setStatus("ready");
      setError(null);
    } catch (cause) {
      if (turn !== latestRead.current) return;

      if (cause instanceof ApiError && cause.code === "friends-unavailable") {
        setStatus("unavailable");
        return;
      }

      setError(cause);
      // A refresh that fails leaves the list that was already there on screen.
      setStatus((current) => (current === "ready" ? current : "error"));
    }
  }, []);

  useEffect(() => {
    if (!ready || !userId) {
      latestRead.current += 1;
      setOverview(null);
      setStatus("loading");
      setError(null);
      return;
    }

    setStatus("loading");
    setError(null);
    void load();

    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);

    return () => window.removeEventListener("focus", onFocus);
  }, [ready, userId, load]);

  /**
   * The words for a failure, in the site language: the API's reason where it
   * has one here, otherwise by what kind of failure it was (no connection, a
   * session that has ended, the server failing). The API's own message for
   * those is English and written for a developer ("Failed to accept the
   * request: ...", or how to start the API).
   */
  const explain = useCallback((cause: unknown): string => errorText(cause, t, refusalText), [t]);

  /** Runs a change, then reads the list again whether or not it worked: a refusal usually means it was out of date. */
  const change = useCallback(
    async <T,>(run: () => Promise<T>): Promise<T> => {
      try {
        return await run();
      } finally {
        await load();
      }
    },
    [load]
  );

  return {
    overview,
    status,
    error,
    reload: load,
    explain,
    send: (emailOrUsername: string) => change(() => friendsApi.sendFriendRequest(emailOrUsername)),
    accept: (requestId: string) => change(() => friendsApi.acceptFriendRequest(requestId)),
    decline: (requestId: string) => change(() => friendsApi.declineFriendRequest(requestId)),
    cancel: (requestId: string) => change(() => friendsApi.cancelFriendRequest(requestId)),
    remove: (friendshipId: string) => change(() => friendsApi.removeFriend(friendshipId))
  };
}
