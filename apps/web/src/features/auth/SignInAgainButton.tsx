import { navigate } from "../../app/router";
import { useLanguage } from "../../lib/i18n";
import { useAuth } from "./AuthContext";
import { currentRoute, signInRoute } from "./returnPath";

/**
 * The way out of a session the server no longer accepts.
 *
 * The tab can still hold a session that has ended elsewhere (signed out on
 * another device, or expired), so every request comes back "sign in again"
 * and "Try again" only repeats it. The sign-in page sends a signed-in tab
 * straight back, so this signs the tab out first, and the sign-in comes back
 * to this page.
 */
export function SignInAgainButton() {
  const { t } = useLanguage();
  const { signOut } = useAuth();

  return (
    <button
      type="button"
      className="link-button"
      onClick={async () => {
        const here = currentRoute();
        await signOut();
        navigate(signInRoute("login", here));
      }}
    >
      {t("nav.signIn")}
    </button>
  );
}
