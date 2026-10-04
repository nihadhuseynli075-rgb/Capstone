import { Fragment, useEffect, useState, type ReactNode } from "react";
import { replaceRoute, useRouteParam } from "../../app/router";
import { fill, useLanguage } from "../../lib/i18n";
import { emailProblemText, errorText, nameProblemText, passwordProblemText } from "../profile/profileText";
import { useAuth } from "./AuthContext";
import { AuthDivider, AuthLayout, Field, PasswordField, focusFirstError } from "./AuthLayout";
import { GoogleButton } from "./GoogleButton";
import { strengthText } from "./authText";
import { emailProblem, nameProblem, passwordProblem, passwordStrength } from "./authValidation";
import { safeReturnPath, signInRoute } from "./returnPath";

/** A sentence from the dictionary with links put in its {placeholders}, wherever each language has them. */
function fillLinks(template: string, links: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={index}>{name && links[name] !== undefined ? links[name] : part}</Fragment>;
  });
}

export function RegisterPage() {
  const { t } = useLanguage();
  const { signUp, user, configured } = useAuth();

  // The page that sent the student to sign in, carried over from there.
  const returnTo = safeReturnPath(useRouteParam("next"));

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  // Signed in: the form's step in the history becomes the page that asked for
  // the sign-in, so Back goes to wherever the student was before it (see LoginPage).
  useEffect(() => {
    if (user) replaceRoute(returnTo);
  }, [user, returnTo]);

  const strength = passwordStrength(password);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // The same problem names the profile page words, so the two pages agree
    // about what is wrong and say it in the same language.
    const nameIssue = nameProblem(fullName);
    const emailIssue = emailProblem(email);
    const passwordIssue = passwordProblem(password);

    const errors = {
      fullName: nameIssue ? nameProblemText(nameIssue, t) : undefined,
      email: emailIssue ? emailProblemText(emailIssue, t) : undefined,
      password: passwordIssue ? passwordProblemText(passwordIssue, t) : undefined
    };

    setFieldErrors(errors);
    if (errors.fullName || errors.email || errors.password) {
      focusFirstError(
        errors.fullName && "register-name",
        errors.email && "register-email",
        errors.password && "register-password"
      );
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const { needsEmailConfirmation } = await signUp({
        fullName,
        email: email.trim(),
        password
      });

      if (needsEmailConfirmation) {
        setConfirmationSent(true);
        setSubmitting(false);
        return;
      }

      replaceRoute(returnTo);
    } catch (cause) {
      setFormError(errorText(cause, t));
      setSubmitting(false);
    }
  }

  // Confirmation is on for this project, so signing up ends here rather than on
  // the main page. Saying nothing would look like the sign-up simply failed.
  if (confirmationSent) {
    return (
      <AuthLayout
        title={t("auth.checkEmailTitle")}
        subtitle={fill(t("auth.checkEmailBody"), { email: email.trim() })}
        footer={
          <>
            <span>{t("auth.alreadyConfirmed")}</span>{" "}
            <a href={`#${signInRoute("login", returnTo)}`}>{t("nav.signIn")}</a>
          </>
        }
      >
        <p className="success-banner" role="status">
          {t("auth.checkEmailNote")}
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
      footer={
        <>
          <span>{t("auth.haveAccount")}</span>{" "}
          <a href={`#${signInRoute("login", returnTo)}`}>{t("nav.signIn")}</a>
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

      <GoogleButton disabled={submitting || !configured} onError={setFormError} returnTo={returnTo} />

      <AuthDivider label={t("auth.orEmailSignUp")} />

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Field
          id="register-name"
          label={t("profile.name")}
          type="text"
          autoComplete="name"
          placeholder={t("auth.namePlaceholder")}
          value={fullName}
          error={fieldErrors.fullName}
          disabled={submitting || !configured}
          onChange={(event) => setFullName(event.target.value)}
        />

        <Field
          id="register-email"
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
          id="register-password"
          label={t("profile.password")}
          autoComplete="new-password"
          placeholder={t("auth.newPasswordPlaceholder")}
          hint={t("profile.passwordHint")}
          value={password}
          error={fieldErrors.password}
          disabled={submitting || !configured}
          onChange={(event) => setPassword(event.target.value)}
        />

        {password.length > 0 && (
          <div className="strength" aria-live="polite">
            <div className="strength-track">
              <div
                className={`strength-fill ${strength.level}`}
                style={{ width: `${strength.percent}%` }}
              />
            </div>
            <span className="strength-label">{strengthText(strength.level, t)}</span>
          </div>
        )}

        <button type="submit" className="primary-button auth-submit" disabled={submitting || !configured}>
          {submitting ? t("auth.creatingAccount") : t("auth.createAccount")}
        </button>

        {/* Said where the account is made, not only in the footer: the
            accounts are Grade 9 students'. */}
        <p className="auth-legal-notice">
          {fillLinks(t("legal.signUpNotice"), {
            terms: <a href="#/terms">{t("legal.termsInline")}</a>,
            privacy: <a href="#/privacy">{t("legal.privacyInline")}</a>
          })}
        </p>
      </form>
    </AuthLayout>
  );
}
