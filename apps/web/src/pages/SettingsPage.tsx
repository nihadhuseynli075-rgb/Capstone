import { useAuth } from "../features/auth/AuthContext";
import { languages, useLanguage, type Language } from "../lib/i18n";
import { useTheme } from "../lib/theme";

/**
 * Appearance settings, and the way to the account.
 *
 * Appearance works signed out, because theme and language are per-browser
 * choices rather than account data. Everything that is account data (the
 * name, the photo, the password) lives on the profile page, so this only
 * points there, or to sign-in.
 */
export function SettingsPage() {
  const { t } = useLanguage();
  const { language, setLanguage } = useLanguage();
  const { user, configured } = useAuth();

  // Shared with the header toggle, so changing it here updates that too.
  const [theme, setTheme] = useTheme();

  return (
    <div className="stack">
      <section>
        <h1>{t("settings.title")}</h1>
        <p className="lede">{t("settings.subtitle")}</p>
      </section>

      <div className="settings-grid">
        <section className="panel settings-panel">
          <h2>{t("settings.account")}</h2>
          <p className="panel-hint">
            {user ? t("settings.accountBody") : configured ? t("settings.signedOut") : t("settings.notConfigured")}
          </p>
          {(user || configured) && (
            <div className="settings-actions">
              <a className="primary-button" href={user ? "#/profile" : "#/login"}>
                {user ? t("settings.openProfile") : t("settings.signInCta")}
              </a>
            </div>
          )}
        </section>

        <section className="panel settings-panel">
          <h2>{t("settings.appearance")}</h2>

          <div className="auth-field">
            <label id="theme-label">{t("settings.theme")}</label>
            <div className="segmented" role="group" aria-labelledby="theme-label">
              <button
                type="button"
                className={theme === "light" ? "selected" : undefined}
                aria-pressed={theme === "light"}
                onClick={() => setTheme("light")}
              >
                {t("settings.themeLight")}
              </button>
              <button
                type="button"
                className={theme === "dark" ? "selected" : undefined}
                aria-pressed={theme === "dark"}
                onClick={() => setTheme("dark")}
              >
                {t("settings.themeDark")}
              </button>
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="language-select">{t("settings.language")}</label>
            <select
              id="language-select"
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              {languages.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="auth-field-hint">{t("settings.languageHint")}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
