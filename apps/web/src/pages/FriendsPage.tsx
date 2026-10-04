import { useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { SignInAgainButton } from "../features/auth/SignInAgainButton";
import { AddFriendPanel } from "../features/friends/AddFriendPanel";
import { FriendsList } from "../features/friends/FriendsList";
import { RequestsPanel } from "../features/friends/RequestsPanel";
import { useFriends } from "../features/friends/useFriends";
import { needsSignInAgain } from "../features/profile/profileText";
import { useLanguage } from "../lib/i18n";
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
  const [actionError, setActionError] = useState<unknown>(null);

  async function act(id: string, run: () => Promise<unknown>): Promise<void> {
    setBusyId(id);
    setActionError(null);

    try {
      await run();
    } catch (cause) {
      setActionError(cause);
    } finally {
      setBusyId(null);
    }
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
              <a className="primary-button" href="#/login">
                {t("nav.signIn")}
              </a>
            </div>
          )}
        </section>
      </div>
    );
  }

  const { overview, status, error } = friends;

  const loadText = error === null ? null : friends.explain(error);
  const actionText = actionError === null ? null : friends.explain(actionError);
  // A session that has ended fails the action and the read after it alike, and
  // the same sentence twice said nothing more.
  const showAction = actionText !== null && !((status === "error" || status === "ready") && actionText === loadText);

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

      {(status === "error" || (status === "ready" && error !== null)) && (
        <p className="error-banner" role="alert">
          {loadText}{" "}
          {needsSignInAgain(error) ? (
            <SignInAgainButton />
          ) : (
            <button type="button" className="link-button" onClick={() => void friends.reload()}>
              {t("friends.retry")}
            </button>
          )}
        </p>
      )}

      {showAction && (
        <p className="error-banner" role="alert">
          {actionText} {needsSignInAgain(actionError) && <SignInAgainButton />}
        </p>
      )}

      {overview && (
        <>
          <AddFriendPanel onSend={friends.send} explain={friends.explain} />

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
            onRemove={(id) => act(id, () => friends.remove(id))}
          />
        </>
      )}
    </div>
  );
}
