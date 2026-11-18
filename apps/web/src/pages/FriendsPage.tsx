import { useState } from "react";
import { navigate, useRouteParam } from "../app/router";
import { useAuth } from "../features/auth/AuthContext";
import { SignInAgainButton } from "../features/auth/SignInAgainButton";
import { signInRoute } from "../features/auth/returnPath";
import { AddFriendPanel } from "../features/friends/AddFriendPanel";
import { FriendsList } from "../features/friends/FriendsList";
import { RequestsPanel } from "../features/friends/RequestsPanel";
import { useFriends } from "../features/friends/useFriends";
import { CommunityPanel, MakeTestButton, MyTestsPanel } from "../features/studentTests/StudentTestLists";
import { needsSignInAgain } from "../features/profile/profileText";
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
/** The page's three parts (session of 18 Nov 2026): friends, the tests you made, and everyone's. */
type FriendsTab = "friends" | "mine" | "community";
const TABS: Array<{ id: FriendsTab; label: TranslationKey }> = [
  { id: "friends", label: "mytests.tabFriends" },
  { id: "mine", label: "mytests.tabMine" },
  { id: "community", label: "mytests.tabCommunity" }
];

/**
 * The tabs along the top. The tab is in the address (#/friends?tab=mine), so
 * Back returns to it and a link can open it; changing it keeps the page
 * mounted, as the query is not part of the route.
 */
function FriendsTabs({ current }: { current: FriendsTab }) {
  const { t } = useLanguage();
  return (
    <div className="friends-tabs" role="tablist" aria-label={t("mytests.tabsLabel")}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`friends-tab-${tab.id}`}
          aria-selected={current === tab.id}
          className={`friends-tab${current === tab.id ? " active" : ""}`}
          onClick={() => navigate(tab.id === "friends" ? "/friends" : `/friends?tab=${tab.id}`)}
        >
          {t(tab.label)}
        </button>
      ))}
    </div>
  );
}

export function FriendsPage() {
  const { t } = useLanguage();
  const tabParam = useRouteParam("tab");
  const tab: FriendsTab = tabParam === "mine" || tabParam === "community" ? tabParam : "friends";
  const { user, configured } = useAuth();
  const friends = useFriends();

  // The request or friendship being acted on, which holds every button until
  // the answer is back so nothing is pressed twice.
  const [busyId, setBusyId] = useState<string | null>(null);
  // The failure itself, worded when shown (see below), and what to say if the
  // row it was about had already gone.
  const [actionError, setActionError] = useState<{ cause: unknown; goneText?: TranslationKey } | null>(null);

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
      setActionError({ cause, goneText });
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
    <section className="friends-heading">
      <div>
        <h1>{t("friends.title")}</h1>
        <p className="lede">{t("friends.subtitle")}</p>
      </div>
      {user && configured && <MakeTestButton />}
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

  if (tab !== "friends") {
    return (
      <div className="stack">
        {heading}
        <FriendsTabs current={tab} />
        <div role="tabpanel" aria-labelledby={`friends-tab-${tab}`}>
          {tab === "mine" ? <MyTestsPanel /> : <CommunityPanel />}
        </div>
      </div>
    );
  }

  const { overview, status, error } = friends;

  const loadText = error === null ? null : friends.explain(error);
  const actionGone =
    actionError !== null && actionError.cause instanceof ApiError && actionError.cause.code === "gone";
  const actionText =
    actionError === null
      ? null
      : actionGone && actionError.goneText
        ? t(actionError.goneText)
        : friends.explain(actionError.cause);
  // A session that has ended fails the action and the read after it alike, and
  // the same sentence twice said nothing more.
  const showLoad = status === "error" || (status === "ready" && error !== null);
  const showAction = actionText !== null && !((status === "error" || status === "ready") && actionText === loadText);

  return (
    <div className="stack">
      {heading}
      <FriendsTabs current="friends" />

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

      {showLoad && (
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
          {actionText} {actionError !== null && needsSignInAgain(actionError.cause) && <SignInAgainButton />}
        </p>
      )}

      {overview && (
        <>
          <AddFriendPanel
            onSend={send}
            explain={friends.explain}
            // Both only ever go up, so the sum moves whenever either does: an
            // action here, or a read that found the lists changed elsewhere.
            resetSignal={actionCount + friends.changedElsewhere}
            // The field shows its own failure, but not one the page already
            // says in a banner above it.
            bannerText={showLoad ? loadText : showAction ? actionText : null}
          />

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
