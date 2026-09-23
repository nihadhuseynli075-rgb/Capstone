import { useEffect, useState } from "react";
import { navigate } from "../../app/router";
import { useAuth } from "./AuthContext";
import { AuthDivider, AuthLayout, Field, PasswordField } from "./AuthLayout";
import { GoogleButton } from "./GoogleButton";
import { passwordStrength, validateEmail, validateName, validatePassword } from "./authValidation";

export function RegisterPage() {
  const { signUp, user, configured } = useAuth();

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

  useEffect(() => {
    if (user) navigate("/");
  }, [user]);

  const strength = passwordStrength(password);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const nameError = validateName(fullName);
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);

    setFieldErrors({
      fullName: nameError ?? undefined,
      email: emailError ?? undefined,
      password: passwordError ?? undefined
    });

    if (nameError || emailError || passwordError) return;

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

      navigate("/");
    } catch (cause) {
      setFormError((cause as Error).message);
      setSubmitting(false);
    }
  }

  // Confirmation is on for this project, so signing up ends here rather than on
  // the main page. Saying nothing would look like the sign-up simply failed.
  if (confirmationSent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={`We sent a confirmation link to ${email.trim()}. Open it to finish setting up your account.`}
        footer={
          <>
            <span>Already confirmed?</span> <a href="#/login">Sign in</a>
          </>
        }
      >
        <p className="success-banner" role="status">
          Nothing else to do here. The link expires after 24 hours, so if it has been longer than
          that, sign up again with the same email.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Your tests, your history and your best result, saved and on any device."
      footer={
        <>
          <span>Already have an account?</span> <a href="#/login">Sign in</a>
        </>
      }
    >
      {!configured && (
        <p className="warning-banner" role="status">
          Accounts are not switched on yet because Supabase is not connected. You can still{" "}
          <a href="#/build">take a test as a guest</a>.
        </p>
      )}

      {formError && (
        <p className="error-banner" role="alert">
          {formError}
        </p>
      )}

      <GoogleButton disabled={submitting || !configured} onError={setFormError} />

      <AuthDivider label="or sign up with your email" />

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Field
          id="register-name"
          label="Name"
          type="text"
          autoComplete="name"
          placeholder="Your name"
          value={fullName}
          error={fieldErrors.fullName}
          disabled={submitting || !configured}
          onChange={(event) => setFullName(event.target.value)}
        />

        <Field
          id="register-email"
          label="Email"
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
          label="Password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint="At least 8 characters, with a letter and a number."
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
            <span className="strength-label">{strength.label}</span>
          </div>
        )}

        <button type="submit" className="primary-button auth-submit" disabled={submitting || !configured}>
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}
