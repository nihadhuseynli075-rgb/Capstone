import { navigate } from "../app/router";
import { useAuth } from "../features/auth/AuthContext";
import { useLanguage } from "../lib/i18n";

/**
 * An address the app has no page for: a mistyped link, or one from an older
 * version of the site.
 *
 * It used to fall through to the landing page or the dashboard with the bad
 * address still in the bar, which gave no hint that anything had gone wrong.
 * Saying so, with one way home, is all this needs to do.
 */
export function NotFoundPage() {
  const { t } = useLanguage();
  const { user } = useAuth();

  return (
    <div className="stack narrow">
      <section>
        <h1>{t("notFound.title")}</h1>
        <p className="lede">{t("notFound.body")}</p>
      </section>

      <div>
        <button type="button" className="primary-button" onClick={() => navigate("/")}>
          {user ? t("notFound.dashboard") : t("notFound.home")}
        </button>
      </div>
    </div>
  );
}
