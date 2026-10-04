import { useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { signInRoute } from "../features/auth/returnPath";
import { AddFriendPanel } from "../features/friends/AddFriendPanel";
import { FriendsList } from "../features/friends/FriendsList";
import { RequestsPanel } from "../features/friends/RequestsPanel";
import { useFriends } from "../features/friends/useFriends";
import { useLanguage, type TranslationKey } from "../lib/i18n";
import { ApiError } from "../services/apiClient";
import "../styles/friends.css";

/**
 * Friends: ask somebody by email or username, answer the requests that come
 * in, and see how your tests compare with each friend's.
 *
 * Friends are accounts, so this needs a signed-in student and an API that is
 * connected to Supabase. A guest is pointed at signing in, and an API without
 * Supabase is explained, in the same way the profile page does it.
 */
export function FriendsPage() {
  const { t } = useLanguage();
  const { user, configured } = useAuth();
  const friends = useFriends();

  // The request or friendship being acted on, which holds every button until
  // the answer is back so nothing is pressed twice.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Counts the actions taken on the page, so the add-a-friend panel can drop
  // its "Request sent" or "You are now friends" banner once something else
  // has happened. It used to stay through every accept, decline and remove,
  // and sat beside messages that contradicted it.
  const [actionCount, setActionCount] = useState(0);

  /**
   * Runs one action on a request or a friendship. `goneText` is what to say
   * when the row has already gone: the API calls that "gone" for both, and
   * "That request is no longer there" is wrong about a friendship.
   */
  async function act(id: string, run: () => Promise<unknown>, goneText?: TranslationKey): Promise<void> {
    setBusyId(id);
    setActionError(null);
    setActionCount((count) => count + 1);

    try {
      await run();
    } catch (cause) {
      const gone = cause instanceof ApiError && cause.code === "gone";
      setActionError(gone && goneText ? t(goneText) : friends.explain(cause));
    } finally {
      setBusyId(null);
    }
  }

  /** Sending a request is an action too: an older banner about something else no longer applies. */
  function send(emailOrUsername: string) {
    setActionError(null);
    return friends.send(emailOrUsername);
  }

  const heading = (
    <section>
      <h1>{t("friends.title")}</h1>
      <p className="lede">{t("friends.subtitle")}</p>
    </section>
  );

  if (!user) {
    return (
      <div className="stack">
        {heading}

        <section className="panel friends-panel">
          <p className="panel-hint">{configured ? t("friends.signedOut") : t("settings.notConfigured")}</p>
          {configured && (
            <div className="settings-actions">
              <a className="primary-button" href={`#${signInRoute("login", "/friends")}`}>
                {t("nav.signIn")}
              </a>
            </div>
          )}
        </section>
      </div>
    );
  }

  const { overview, status, error } = friends;

  return (
    <div className="stack">
      {heading}

      {status === "loading" && !overview && (
        <p className="panel-hint" role="status">
          {t("friends.loading")}
        </p>
      )}

      {status === "unavailable" && (
        <p className="warning-banner" role="status">
          {t("friends.unavailable")}
        </p>
      )}

      {(status === "error" || (status === "ready" && error)) && (
        <p className="error-banner" role="alert">
          {error}{" "}
          <button type="button" className="link-button" onClick={() => void friends.reload()}>
            {t("friends.retry")}
          </button>
        </p>
      )}

      {actionError && (
        <p className="error-banner" role="alert">
          {actionError}
        </p>
      )}

      {overview && (
        <>
          <AddFriendPanel onSend={send} explain={friends.explain} resetSignal={actionCount} />

          <RequestsPanel
            incoming={overview.incoming}
            outgoing={overview.outgoing}
            busyId={busyId}
            onAccept={(id) => void act(id, () => friends.accept(id))}
            onDecline={(id) => void act(id, () => friends.decline(id))}
            onCancel={(id) => void act(id, () => friends.cancel(id))}
          />

          <FriendsList
            friends={overview.friends}
            me={overview.me}
            busyId={busyId}
            onRemove={(id) => act(id, () => friends.remove(id), "friends.error.friendGone")}
          />
        </>
      )}
    </div>
  );
}
