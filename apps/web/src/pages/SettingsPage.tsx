import { useEffect, useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { Field, PasswordField } from "../features/auth/AuthLayout";
import { validateName, validatePassword } from "../features/auth/authValidation";
import { languages, useLanguage, type Language } from "../lib/i18n";
import { applyTheme, getStoredTheme, type Theme } from "../lib/theme";

/**
 * Account and appearance settings.
 *
 * Appearance works signed out, because theme and language are per-browser
 * choices rather than account data. Name and password need an account, so that
 * half of the page explains itself and links to sign-in instead of rendering
 * inputs that could never save.
 */
export function SettingsPage() {
  const { t } = useLanguage();
  const { language, setLanguage } = useLanguage();
  const { user, configured, updateName, updatePassword } = useAuth();

  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="stack">
      <section>
        <h1>{t("settings.title")}</h1>
        <p className="lede">{t("settings.subtitle")}</p>
      </section>

      <div className="settings-grid">
        {user ? (
          <>
            <NamePanel currentName={user.fullName} email={user.email} onSave={updateName} />
            <PasswordPanel onSave={updatePassword} />
          </>
        ) : (
          <section className="panel settings-panel">
            <h2>{t("settings.profile")}</h2>
            <p className="panel-hint">
              {configured ? t("settings.signedOut") : t("settings.notConfigured")}
            </p>
            {configured && (
              <div className="settings-actions">
                <a className="primary-button" href="#/login">
                  {t("settings.signInCta")}
                </a>
              </div>
            )}
          </section>
        )}

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

function NamePanel({
  currentName,
  email,
  onSave
}: {
  currentName: string;
  email: string;
  onSave: (name: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // The name can change in another tab, or arrive after the session loads.
  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const problem = validateName(name);
    setError(problem);
    setSaved(false);
    if (problem) return;

    setSaving(true);
    try {
      await onSave(name);
      setSaved(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel settings-panel">
      <h2>{t("settings.profile")}</h2>

      <form className="settings-form" onSubmit={handleSubmit} noValidate>
        {saved && (
          <p className="success-banner" role="status">
            {t("settings.nameSaved")}
          </p>
        )}

        <Field
          id="settings-name"
          label={t("settings.name")}
          type="text"
          autoComplete="name"
          value={name}
          error={error}
          disabled={saving}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
        />

        <Field
          id="settings-email"
          label={t("settings.email")}
          type="email"
          value={email}
          hint={t("settings.emailHint")}
          disabled
          readOnly
          onChange={() => undefined}
        />

        <div className="settings-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={saving || name.trim() === currentName}
          >
            {saving ? t("common.saving") : t("settings.saveName")}
          </button>
        </div>
      </form>
    </section>
  );
}

function PasswordPanel({ onSave }: { onSave: (password: string) => Promise<void> }) {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const passwordError = validatePassword(password);
    const confirmError = password !== confirm ? t("settings.passwordMismatch") : undefined;

    setErrors({ password: passwordError ?? undefined, confirm: confirmError });
    setFormError(null);
    setSaved(false);
    if (passwordError || confirmError) return;

    setSaving(true);
    try {
      await onSave(password);
      setSaved(true);
      setPassword("");
      setConfirm("");
    } catch (cause) {
      setFormError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel settings-panel">
      <h2>{t("settings.password")}</h2>

      <form className="settings-form" onSubmit={handleSubmit} noValidate>
        {saved && (
          <p className="success-banner" role="status">
            {t("settings.passwordSaved")}
          </p>
        )}
        {formError && (
          <p className="error-banner" role="alert">
            {formError}
          </p>
        )}

        <PasswordField
          id="settings-password"
          label={t("settings.newPassword")}
          autoComplete="new-password"
          value={password}
          error={errors.password}
          hint="At least 8 characters, with a letter and a number."
          disabled={saving}
          onChange={(event) => setPassword(event.target.value)}
        />

        <PasswordField
          id="settings-password-confirm"
          label={t("settings.confirmPassword")}
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          disabled={saving}
          onChange={(event) => setConfirm(event.target.value)}
        />

        <div className="settings-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={saving || password.length === 0}
          >
            {saving ? t("common.saving") : t("settings.savePassword")}
          </button>
        </div>
      </form>
    </section>
  );
}
