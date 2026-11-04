import { languages, useLanguage, type Language } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";

/**
 * Light or dark, on the profile page.
 *
 * It works signed out, because the theme is a choice for this browser rather
 * than account data. The value is shared with the header toggle, so changing
 * it here updates that too.
 */
export function AppearancePanel() {
  const { t } = useLanguage();
  const [theme, setTheme] = useTheme();

  return (
    <section className="panel settings-panel">
      <h2>{t("settings.appearance")}</h2>
      <p className="panel-hint">{t("settings.deviceHint")}</p>

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
    </section>
  );
}

/**
 * The site language, on the profile page. Like the theme, it belongs to this
 * browser, so a guest can change it too.
 */
export function LanguagePanel() {
  const { t, language, setLanguage } = useLanguage();

  return (
    <section className="panel settings-panel">
      <h2>{t("settings.language")}</h2>

      <div className="auth-field">
        <label htmlFor="language-select" className="visually-hidden">
          {t("settings.language")}
        </label>
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
  );
}
