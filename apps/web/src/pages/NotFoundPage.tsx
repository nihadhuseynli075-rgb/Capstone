import { navigate } from "../app/router";
import { PageBand } from "../components/PageBand";
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

  // The navy band and ridge of the other plain pages, with the climb stopping
  // short of the flag: the way home is the one action, inside the band.
  return (
    <div className="stack">
      <PageBand title={t("notFound.title")} intro={t("notFound.body")} short>
        <div>
          <button type="button" className="primary-button" onClick={() => navigate("/")}>
            {user ? t("notFound.dashboard") : t("notFound.home")}
          </button>
        </div>
      </PageBand>
    </div>
  );
}
