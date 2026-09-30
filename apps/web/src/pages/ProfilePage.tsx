import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { Field, PasswordField } from "../features/auth/AuthLayout";
import { validateName, validatePassword } from "../features/auth/authValidation";
import { DeleteAccountPanel } from "../features/profile/DeleteAccountPanel";
import { PhotoPanel } from "../features/profile/PhotoPanel";
import { useProfile } from "../features/profile/ProfileContext";
import { SignInMethodsPanel } from "../features/profile/SignInMethodsPanel";
import { formatDay, useLanguage } from "../lib/i18n";

/**
 * Everything about the student's account, in one place.
 *
 * Read: the photo, name, email and when the account was made. Update: the
 * name, the photo, the password, and whether Google is connected. Delete: the
 * photo, or the whole account. Signing in with Google lands here, so a new
 * student sees straight away the name and photo Google gave them, and where
 * to change them.
 *
 * The name, the photo and deleting the account go through the API. The
 * password and Google connect straight to Supabase, so those two still work
 * while the API is running without it.
 */
export function ProfilePage() {
  const { t, language } = useLanguage();
  const { user, configured, updatePassword, redirectResult, clearRedirectResult } = useAuth();
  const { profile, status, error, reload } = useProfile();

  // Kept here rather than read from the session, which is gone the moment
  // the account is: this page stays up to say it worked.
  const [deleted, setDeleted] = useState(false);

  // Something that came back from a redirect failed while this student was
  // still signed in. Connecting Google says so on its own panel, so this is
  // everything else: an expired email link, most likely.
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    if (redirectResult?.error && redirectResult.intent !== "link") {
      setRedirectError(redirectResult.error);
      clearRedirectResult();
    }
  }, [redirectResult, clearRedirectResult]);

  if (deleted) {
    return (
      <div className="stack narrow">
        <section className="panel">
          <h1>{t("profile.deletedTitle")}</h1>
          <p className="panel-hint">{t("profile.deletedBody")}</p>
          <div className="settings-actions">
            <a className="primary-button" href="#/">
              {t("profile.backHome")}
            </a>
          </div>
        </section>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="stack">
        <section>
          <h1>{t("profile.title")}</h1>
        </section>

        <section className="panel settings-panel">
          <p className="panel-hint">{configured ? t("profile.signedOut") : t("settings.notConfigured")}</p>
          {configured && (
            <div className="settings-actions">
              <a className="primary-button" href="#/login">
                {t("nav.signIn")}
              </a>
            </div>
          )}
        </section>
      </div>
    );
  }

  const name = profile?.fullName ?? user.fullName;
  const email = profile?.email || user.email;
  // Nothing is changed until the latest profile has arrived, so an edit can
  // never be overwritten by an older copy still on its way.
  const editable = status === "ready";

  const memberSince = profile ? formatDay(profile.createdAt, language) : null;

  return (
    <div className="stack">
      <section>
        <h1>{t("profile.title")}</h1>
        <p className="lede">{t("profile.subtitle")}</p>
      </section>

      {status === "loading" && !profile && (
        <p className="panel-hint" role="status">
          {t("profile.loading")}
        </p>
      )}

      {redirectError && (
        <p className="error-banner" role="alert">
          {redirectError}
        </p>
      )}

      {status === "unavailable" && (
        <p className="warning-banner" role="status">
          {t("profile.unavailable")}
        </p>
      )}

      {status === "error" && (
        <p className="error-banner" role="alert">
          {error}{" "}
          <button type="button" className="link-button" onClick={reload}>
            {t("profile.retry")}
          </button>
        </p>
      )}

      <div className="settings-grid">
        <PhotoPanel name={name} email={email} memberSince={memberSince} editable={editable} />
        <NamePanel currentName={name} email={email} editable={editable} />
        <SignInMethodsPanel />
        <PasswordPanel googleOnly={!user.providers.includes("email")} onSave={updatePassword} />
        <DeleteAccountPanel email={email} editable={editable} onDeleted={() => setDeleted(true)} />
      </div>
    </div>
  );
}

function NamePanel({ currentName, email, editable }: { currentName: string; email: string; editable: boolean }) {
  const { t } = useLanguage();
  const { rename } = useProfile();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // The name can change in another tab, or arrive after the page opens.
  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const problem = validateName(name);
    setError(problem);
    setSaved(false);
    if (problem) return;

    setSaving(true);
    try {
      await rename(name);
      setSaved(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel settings-panel">
      <h2>{t("profile.details")}</h2>

      <form className="settings-form" onSubmit={handleSubmit} noValidate>
        {saved && (
          <p className="success-banner" role="status">
            {t("profile.nameSaved")}
          </p>
        )}

        <Field
          id="profile-name"
          label={t("profile.name")}
          type="text"
          autoComplete="name"
          value={name}
          error={error}
          disabled={saving || !editable}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
        />

        <Field
          id="profile-email"
          label={t("profile.email")}
          type="email"
          value={email}
          hint={t("profile.emailHint")}
          disabled
          readOnly
          onChange={() => undefined}
        />

        <div className="settings-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={saving || !editable || name.trim() === currentName}
          >
            {saving ? t("common.saving") : t("profile.saveName")}
          </button>
        </div>
      </form>
    </section>
  );
}

function PasswordPanel({
  googleOnly,
  onSave
}: {
  googleOnly: boolean;
  onSave: (password: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const passwordError = validatePassword(password);
    const confirmError = password !== confirm ? t("profile.passwordMismatch") : undefined;

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
      <h2>{t("profile.password")}</h2>

      {/* Someone who only ever signed in with Google may not know there is a password to set. */}
      {googleOnly && <p className="panel-hint">{t("profile.passwordGoogleOnly")}</p>}

      <form className="settings-form" onSubmit={handleSubmit} noValidate>
        {saved && (
          <p className="success-banner" role="status">
            {t("profile.passwordSaved")}
          </p>
        )}
        {formError && (
          <p className="error-banner" role="alert">
            {formError}
          </p>
        )}

        <PasswordField
          id="profile-password"
          label={t("profile.newPassword")}
          autoComplete="new-password"
          value={password}
          error={errors.password}
          hint={t("profile.passwordHint")}
          disabled={saving}
          onChange={(event) => setPassword(event.target.value)}
        />

        <PasswordField
          id="profile-password-confirm"
          label={t("profile.confirmPassword")}
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          disabled={saving}
          onChange={(event) => setConfirm(event.target.value)}
        />

        <div className="settings-actions">
          <button type="submit" className="primary-button" disabled={saving || password.length === 0}>
            {saving ? t("common.saving") : t("profile.savePassword")}
          </button>
        </div>
      </form>
    </section>
  );
}
