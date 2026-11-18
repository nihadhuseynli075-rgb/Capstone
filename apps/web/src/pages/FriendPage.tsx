import { useEffect, useState } from "react";
import { useRouteParam } from "../app/router";
import { useAuth } from "../features/auth/AuthContext";
import { signInRoute } from "../features/auth/returnPath";
import { fill } from "../features/friends/fill";
import { Avatar } from "../features/profile/Avatar";
import { SittableTestList, StudentTestErrorBanner } from "../features/studentTests/StudentTestLists";
import { useLanguage } from "../lib/i18n";
import { fetchPersonTests, type PersonTests } from "../services/studentTestsApi";
import "../styles/friends.css";

/**
 * A friend's page (session of 18 Nov 2026): their photo, name and username,
 * and the tests they made, any of which can be taken from here. Only for a
 * friend (or yourself); the API answers anyone else as not found.
 */
export function FriendPage() {
  const { t } = useLanguage();
  const { user, configured } = useAuth();
  const id = useRouteParam("id");
  const [load, setLoad] = useState<
    { status: "loading" } | { status: "ready"; page: PersonTests } | { status: "error"; cause: unknown }
  >({ status: "loading" });

  useEffect(() => {
    if (!user || !id) return;
    let active = true;
    setLoad({ status: "loading" });
    fetchPersonTests(id)
      .then((page) => active && setLoad({ status: "ready", page }))
      .catch((cause: unknown) => active && setLoad({ status: "error", cause }));
    return () => {
      active = false;
    };
  }, [user?.id, id]);

  const back = (
    <a className="link-button friend-page-back" href="#/friends">
      ← {t("friendPage.back")}
    </a>
  );

  // Every state has the page's name as its heading, for a screen reader's
  // list of headings; the friend's own name replaces it once loaded.
  const pageHeading = <h1>{t("title.friendPage")}</h1>;

  if (!user) {
    return (
      <div className="stack">
        {back}
        {pageHeading}
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

  if (!id) {
    return (
      <div className="stack">
        {back}
        {pageHeading}
        <p className="error-banner" role="alert">
          {t("friendPage.notFriends")}
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      {back}
      {load.status !== "ready" && pageHeading}

      {load.status === "loading" && (
        <p className="panel-hint" role="status">
          {t("friendPage.loading")}
        </p>
      )}
      {load.status === "error" && <StudentTestErrorBanner cause={load.cause} />}

      {load.status === "ready" && (
        <>
          <section className="friend-page-head">
            <Avatar name={load.page.person.fullName} photoUrl={load.page.person.avatarUrl} size={88} />
            <div>
              <h1>{load.page.person.fullName}</h1>
              {load.page.person.username && <p className="friend-page-handle">@{load.page.person.username}</p>}
            </div>
          </section>

          <section className="panel friends-panel" aria-labelledby="friend-tests-title">
            <h2 id="friend-tests-title">{fill(t("friendPage.testsTitle"), { name: load.page.person.fullName })}</h2>
            <SittableTestList
              showAuthor={false}
              tests={load.page.tests}
              emptyText={fill(t("friendPage.empty"), { name: load.page.person.fullName })}
            />
          </section>
        </>
      )}
    </div>
  );
}
