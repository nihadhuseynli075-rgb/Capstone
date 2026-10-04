import { useState } from "react";
import type { FormEvent } from "react";
import { replaceRoute } from "../../app/router";
import { useLanguage } from "../../lib/i18n";
import { emailProblemText, errorText, passwordProblemText } from "../profile/profileText";
import { useAuth } from "./AuthContext";
import { AuthLayout, Field, PasswordField, focusFirstError } from "./AuthLayout";
import { emailProblem, passwordProblem } from "./authValidation";

/**
 * A forgotten password, both halves.
 *
 * Signed out, the page asks for the email address and has Supabase send a
 * link. It says the same thing whether or not the address has an account,
 * because a page that said otherwise would tell anyone who typed an address
 * in whether that student uses ExamPeak.
 *
 * The link signs the student in (the PASSWORD_RECOVERY event, see
 * AuthContext) and brings them back here, now signed in, to choose the new
 * password. A student who was already signed in and comes here gets the same
 * form, which is the same change the profile page makes.
 */
export function ResetPasswordPage() {
  const { t } = useLanguage();
  const { user, configured, requestPasswordReset, updatePassword, clearPasswordRecovery } = useAuth();

  return user ? (
    <NewPasswordForm
      onSave={async (password) => {
        await updatePassword(password);
        clearPasswordRecovery();
      }}
    />
  ) : (
    <RequestLinkForm configured={configured} onRequest={requestPasswordReset} t={t} />
  );
}

function RequestLinkForm({
  configured,
  onRequest,
  t
}: {
  configured: boolean;
  onRequest: (email: string) => Promise<void>;
  t: ReturnType<typeof useLanguage>["t"];
}) {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const problem = emailProblem(email);
    setFieldError(problem ? emailProblemText(problem, t) : null);
    if (problem) {
      focusFirstError("reset-email");
      return;
    }

    setSending(true);
    setFormError(null);

    try {
      await onRequest(email.trim());
      setSent(true);
    } catch (cause) {
      // Only failures that say nothing about the address get here: the
      // server down, the network gone, too many tries.
      setFormError(errorText(cause, t));
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthLayout
      title={t("auth.resetTitle")}
      subtitle={t("auth.resetSubtitle")}
      footer={
        <>
          <span>{t("auth.rememberedIt")}</span> <a href="#/login">{t("nav.signIn")}</a>
        </>
      }
    >
      {!configured && (
        <p className="warning-banner" role="status">
          {t("profile.errNotConfigured")}
        </p>
      )}

      {sent && (
        <p className="success-banner" role="status">
          {t("auth.resetSent")}
        </p>
      )}

      {formError && (
        <p className="error-banner" role="alert">
          {formError}
        </p>
      )}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Field
          id="reset-email"
          label={t("profile.email")}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          error={fieldError}
          disabled={sending || !configured}
          onChange={(event) => {
            setEmail(event.target.value);
            setFieldError(null);
          }}
        />

        <button type="submit" className="primary-button auth-submit" disabled={sending || !configured}>
          {sending ? t("auth.resetSending") : t("auth.resetSend")}
        </button>
      </form>
    </AuthLayout>
  );
}

function NewPasswordForm({ onSave }: { onSave: (password: string) => Promise<void> }) {
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const problem = passwordProblem(password);
    const passwordError = problem ? passwordProblemText(problem, t) : undefined;
    const confirmError = password !== confirm ? t("profile.passwordMismatch") : undefined;

    setErrors({ password: passwordError, confirm: confirmError });
    setFormError(null);
    if (passwordError || confirmError) {
      focusFirstError(passwordError && "reset-password", confirmError && "reset-password-confirm");
      return;
    }

    setSaving(true);

    try {
      await onSave(password);
      setSaved(true);
    } catch (cause) {
      setFormError(errorText(cause, t));
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <AuthLayout title={t("auth.newPasswordTitle")} subtitle={t("auth.newPasswordSaved")} footer={null}>
        <button type="button" className="primary-button auth-submit" onClick={() => replaceRoute("/")}>
          {t("auth.goToDashboard")}
        </button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("auth.newPasswordTitle")} subtitle={t("auth.newPasswordSubtitle")} footer={null}>
      {formError && (
        <p className="error-banner" role="alert">
          {formError}
        </p>
      )}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <PasswordField
          id="reset-password"
          label={t("profile.newPassword")}
          autoComplete="new-password"
          hint={t("profile.passwordHint")}
          value={password}
          error={errors.password}
          disabled={saving}
          onChange={(event) => setPassword(event.target.value)}
        />

        <PasswordField
          id="reset-password-confirm"
          label={t("profile.confirmPassword")}
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          disabled={saving}
          onChange={(event) => setConfirm(event.target.value)}
        />

        <button type="submit" className="primary-button auth-submit" disabled={saving || password.length === 0}>
          {saving ? t("common.saving") : t("profile.savePassword")}
        </button>
      </form>
    </AuthLayout>
  );
}
