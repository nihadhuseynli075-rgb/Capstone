import { languages, useLanguage, type Language } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import { IconMoon, IconSun } from "./icons";

/**
 * Light and dark mode in one tap, from the header bar rather than from inside
 * the collapsible menu or the Settings page (which keeps its own control). The
 * landing page and the sign-in and sign-up pages, which have no header bar,
 * carry it too.
 *
 * The icon is the theme the page is in now, a sun while it is light and a moon
 * while it is dark. The label says what a tap does, so it names the other
 * theme. If the icon should show where a tap leads instead, swap the two icons
 * below; the label is already right for that.
 */
export function ThemeToggle() {
  const { t } = useLanguage();

  const [theme, setTheme] = useTheme();

  const next =
    theme === "light"
      ? "dark"
      : "light";

  const label =
    next === "dark"
      ? t("nav.themeToDark")
      : t("nav.themeToLight");

  return (
    <button
      type="button"
      className="ghost-button icon-button theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      {theme === "light" ? <IconSun /> : <IconMoon />}
    </button>
  );
}

/**
 * The site language, from any page.
 *
 * Settings has the full control, but nothing a guest sees links there: a
 * student who reads Russian or Azerbaijani, landing on an English page, had no
 * way to change it short of typing #/settings. This small one sits on the
 * landing page, on the sign-in and sign-up pages, and in the footer of every
 * other page. Each language is named in itself, so it can be found by someone
 * who cannot read the page it is on.
 */
export function LanguageSelect({ className }: { className?: string }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <select
      className={`language-select${className ? ` ${className}` : ""}`}
      value={language}
      aria-label={t("settings.language")}
      title={t("settings.language")}
      onChange={(event) => setLanguage(event.target.value as Language)}
    >
      {languages.map((option) => (
        <option key={option.id} value={option.id} lang={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
