import { navigate } from "../../app/router";
import { saveActiveTest, type ActiveTest } from "../../lib/examSession";
import { useLanguage } from "../../lib/i18n";
import { resolveStudentIdentity } from "../../lib/studentKey";
import { useAuth } from "./AuthContext";
import { signInRoute } from "./returnPath";

/**
 * The way out of a session that ended part way through a test.
 *
 * The server stops accepting the tab's session (signed out on another device,
 * or the sign-in ran out), so every send of the paper comes back "sign in
 * again" and "Try sending again" only repeats it. Signing in needs the tab
 * signed out first, since the sign-in page sends a signed-in tab straight back,
 * and signing out clears the paper from the tab: the one way to sign in again
 * threw away every answer.
 *
 * So the paper, with the answers on screen, is written back after the sign out,
 * stamped as this browser's guest paper. A guest's paper is handed to whoever
 * signs in next (see settleSessionRecords), which is the student coming back
 * to it, and the sign-in returns to the exam page to send it. The attempt was
 * the account's all along, so the send then succeeds. The timer is the
 * server's and keeps running meanwhile, as it does whenever the paper is left.
 */
export function SignInToFinishButton({ paper, onLeave }: { paper: ActiveTest; onLeave: () => void }) {
  const { t } = useLanguage();
  const { signOut } = useAuth();

  async function signInAgain() {
    await signOut();

    // Makes sure the browser has a guest key the paper can be stamped with: a
    // key already moved onto an account owns nothing, and a paper stamped with
    // it would be thrown away when it is next read.
    await resolveStudentIdentity();

    try {
      saveActiveTest(paper);
    } catch {
      // No room to keep it. Signing in is still the only way on.
    }

    // The paper is saved and this page is being left on purpose, so the
    // "leave this test?" question has nothing to ask.
    onLeave();
    navigate(signInRoute("login", "/exam"));
  }

  return (
    <button type="button" className="ghost-button" onClick={() => void signInAgain()}>
      {t("nav.signIn")}
    </button>
  );
}
