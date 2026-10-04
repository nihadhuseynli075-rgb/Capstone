import { navigate } from "../../app/router";
import { useLanguage } from "../../lib/i18n";
import { useAuth } from "./AuthContext";

/**
 * The way out of a session the server no longer accepts.
 *
 * The tab can still hold a session that has ended elsewhere (signed out on
 * another device, or expired), so every request comes back "sign in again"
 * and "Try again" only repeats it. The sign-in page sends a signed-in tab
 * straight back, so this signs the tab out first.
 */
export function SignInAgainButton() {
  const { t } = useLanguage();
  const { signOut } = useAuth();

  return (
    <button
      type="button"
      className="link-button"
      onClick={async () => {
        await signOut();
        navigate("/login");
      }}
    >
      {t("nav.signIn")}
    </button>
  );
}
