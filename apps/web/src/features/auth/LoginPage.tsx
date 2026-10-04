import { useEffect, useState } from "react";
import { replaceRoute } from "../../app/router";
import { useLanguage } from "../../lib/i18n";
import { emailProblemText, errorText } from "../profile/profileText";
import { useAuth } from "./AuthContext";
import { AuthDivider, AuthLayout, Field, PasswordField } from "./AuthLayout";
import { GoogleButton } from "./GoogleButton";
import { signInRedirectErrorText } from "./authText";
import { emailProblem } from "./authValidation";

export function LoginPage() {
  const { t } = useLanguage();
  const { signIn, user, configured, redirectResult, clearRedirectResult } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in, or signed in from another tab: nothing to do here. The
  // form's own step in the history is swapped for the home page rather than
  // added to, or Back would land here again and be sent straight forward.
  useEffect(() => {
    if (user) replaceRoute("/");
  }, [user]);

  // A trip to Google, or an email link, that did not sign in comes back here
  // with the reason. Anything that failed while still signed in is shown on
  // the profile instead, so whatever reaches this page belongs on it.
  useEffect(() => {
    if (redirectResult?.error) {
      setFormError(signInRedirectErrorText(redirectResult, t));
      clearRedirectResult();
    }
  }, [redirectResult, clearRedirectResult, t]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const problem = emailProblem(email);
    const emailError = problem ? emailProblemText(problem, t) : undefined;
    // Sign-in deliberately does not check the password format. The rules may
    // have changed since the account was made, and the server is the authority.
    const passwordError = password.length === 0 ? t("auth.enterPassword") : undefined;

    setFieldErrors({ email: emailError, password: passwordError });
    if (emailError || passwordError) return;

    setSubmitting(true);
    setFormError(null);

    try {
      await signIn({ email: email.trim(), password });
      replaceRoute("/");
    } catch (cause) {
      setFormError(errorText(cause, t));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={t("auth.loginTitle")}
      subtitle={t("auth.loginSubtitle")}
      footer={
        <>
          <span>{t("auth.newHere")}</span> <a href="#/register">{t("auth.createAccountLink")}</a>
        </>
      }
    >
      {!configured && (
        <p className="warning-banner" role="status">
          {t("profile.errNotConfigured")} <a href="#/build">{t("auth.guestTest")}</a>
        </p>
      )}

      {formError && (
        <p className="error-banner" role="alert">
          {formError}
        </p>
      )}

      <GoogleButton disabled={submitting || !configured} onError={setFormError} />

      <AuthDivider label={t("auth.orEmailSignIn")} />

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Field
          id="login-email"
          label={t("profile.email")}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          error={fieldErrors.email}
          disabled={submitting || !configured}
          onChange={(event) => setEmail(event.target.value)}
        />

        <PasswordField
          id="login-password"
          label={t("profile.password")}
          autoComplete="current-password"
          placeholder={t("auth.passwordPlaceholder")}
          value={password}
          error={fieldErrors.password}
          disabled={submitting || !configured}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button type="submit" className="primary-button auth-submit" disabled={submitting || !configured}>
          {submitting ? t("auth.signingIn") : t("nav.signIn")}
        </button>
      </form>
    </AuthLayout>
  );
}
