import { useEffect, useState } from "react";
import type { StudentTest, StudentTestSummary } from "@grade9/shared";
import { navigate } from "../../app/router";
import { useLanguage } from "../../lib/i18n";
import { ApiError } from "../../services/apiClient";
import { deleteStudentTest, fetchCommunityTests, fetchMyTests } from "../../services/studentTestsApi";
import { SignInAgainButton } from "../auth/SignInAgainButton";
import { fill } from "../friends/fill";
import { needsSignInAgain } from "../profile/profileText";
import { StudentTestCard } from "./StudentTestCard";
import { studentTestErrorText } from "./studentTestText";
import { useSitTest } from "./useSitTest";

/** A list's load: the items, or why there are none to show. */
type Load<T> = { status: "loading" } | { status: "ready"; items: T } | { status: "error"; cause: unknown };

/** The failure under a list, with a way back in when the session has ended. */
function ErrorBanner({ cause }: { cause: unknown }) {
  const { t } = useLanguage();
  const unavailable = cause instanceof ApiError && cause.status === 503;
  return (
    <p className={unavailable ? "warning-banner" : "error-banner"} role={unavailable ? "status" : "alert"}>
      {unavailable ? t("mytests.unavailable") : studentTestErrorText(cause, t)}{" "}
      {needsSignInAgain(cause) && <SignInAgainButton />}
    </p>
  );
}

/** The "Make a test" button, in the Friends page's heading on every tab. */
export function MakeTestButton() {
  const { t } = useLanguage();
  return (
    <a className="primary-button" href="#/make-test">
      {t("mytests.make")}
    </a>
  );
}

/**
 * The student's own tests: take one, change it, or delete it (asked on the
 * card, as removing a friend is).
 */
export function MyTestsPanel() {
  const { t } = useLanguage();
  const [load, setLoad] = useState<Load<StudentTest[]>>({ status: "loading" });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const sitting = useSitTest();

  useEffect(() => {
    let active = true;
    fetchMyTests()
      .then((mine) => active && setLoad({ status: "ready", items: mine.tests }))
      .catch((cause: unknown) => active && setLoad({ status: "error", cause }));
    return () => {
      active = false;
    };
  }, []);

  async function remove(id: string) {
    setBusy(true);
    setActionError(null);
    try {
      await deleteStudentTest(id);
    } catch (cause) {
      // Already gone is what was asked for; anything else is said.
      if (!(cause instanceof ApiError && cause.code === "gone")) setActionError(cause);
    }
    setLoad((current) =>
      current.status === "ready" ? { status: "ready", items: current.items.filter((test) => test.id !== id) } : current
    );
    setConfirming(null);
    setBusy(false);
  }

  return (
    <section className="panel friends-panel" aria-labelledby="my-tests-title">
      <div className="student-tests-head">
        <h2 id="my-tests-title">{t("mytests.mineTitle")}</h2>
      </div>

      {load.status === "loading" && (
        <p className="panel-hint" role="status">
          {t("mytests.loading")}
        </p>
      )}
      {load.status === "error" && <ErrorBanner cause={load.cause} />}
      {actionError !== null && <ErrorBanner cause={actionError} />}
      {sitting.error !== null && <ErrorBanner cause={sitting.error} />}

      {load.status === "ready" &&
        (load.items.length === 0 ? (
          <p className="panel-hint">{t("mytests.mineEmpty")}</p>
        ) : (
          <ul className="student-test-list">
            {load.items.map((test) => (
              <li key={test.id}>
                <StudentTestCard
                  test={{ ...test, questionCount: test.items.length }}
                  showVisibility
                  actions={
                    confirming === test.id ? (
                      <div className="friend-confirm" role="group" aria-label={test.title}>
                        <p>{fill(t("mytests.deleteConfirm"), { title: test.title })}</p>
                        <div className="friend-confirm-actions">
                          <button type="button" className="danger-button danger-solid" disabled={busy} onClick={() => void remove(test.id)}>
                            {t("mytests.deleteYes")}
                          </button>
                          <button type="button" className="ghost-button" autoFocus disabled={busy} onClick={() => setConfirming(null)}>
                            {t("mytests.deleteNo")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="primary-button"
                          aria-label={fill(t("mytests.sitAria"), { title: test.title })}
                          disabled={sitting.starting !== null}
                          onClick={() => void sitting.sit(test.id)}
                        >
                          {sitting.starting === test.id ? t("mytests.starting") : t("mytests.sit")}
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          aria-label={fill(t("mytests.editAria"), { title: test.title })}
                          onClick={() => navigate(`/make-test?id=${encodeURIComponent(test.id)}`)}
                        >
                          {t("mytests.edit")}
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          aria-label={fill(t("mytests.deleteAria"), { title: test.title })}
                          onClick={() => setConfirming(test.id)}
                        >
                          {t("mytests.delete")}
                        </button>
                      </>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

/** Tests sat by anyone: the published ones from every student, and a friend's on their page. */
export function SittableTestList({
  tests,
  emptyText,
  showAuthor = true
}: {
  tests: StudentTestSummary[];
  emptyText: string;
  /** Off on a friend's own page, where every test is theirs. */
  showAuthor?: boolean;
}) {
  const { t } = useLanguage();
  const sitting = useSitTest();

  return (
    <>
      {sitting.error !== null && <ErrorBanner cause={sitting.error} />}
      {tests.length === 0 ? (
        <p className="panel-hint">{emptyText}</p>
      ) : (
        <ul className="student-test-list">
          {tests.map((test) => (
            <li key={test.id}>
              <StudentTestCard
                test={showAuthor ? test : { ...test, author: undefined }}
                actions={
                  <button
                    type="button"
                    className="primary-button"
                    aria-label={fill(t("mytests.sitAria"), { title: test.title })}
                    disabled={sitting.starting !== null}
                    onClick={() => void sitting.sit(test.id)}
                  >
                    {sitting.starting === test.id ? t("mytests.starting") : t("mytests.sit")}
                  </button>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Tests published for everyone, newest first. */
export function CommunityPanel() {
  const { t } = useLanguage();
  const [load, setLoad] = useState<Load<StudentTestSummary[]>>({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetchCommunityTests()
      .then((tests) => active && setLoad({ status: "ready", items: tests }))
      .catch((cause: unknown) => active && setLoad({ status: "error", cause }));
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="panel friends-panel" aria-labelledby="community-tests-title">
      <div className="student-tests-head">
        <h2 id="community-tests-title">{t("mytests.communityTitle")}</h2>
      </div>
      <p className="panel-hint">{t("mytests.communityHint")}</p>

      {load.status === "loading" && (
        <p className="panel-hint" role="status">
          {t("mytests.loading")}
        </p>
      )}
      {load.status === "error" && <ErrorBanner cause={load.cause} />}
      {load.status === "ready" && <SittableTestList tests={load.items} emptyText={t("mytests.communityEmpty")} />}
    </section>
  );
}

export { ErrorBanner as StudentTestErrorBanner };
