import { useEffect, useState } from "react";
import { navigate } from "../../app/router";
import { useAuth } from "./AuthContext";
import { AuthLayout, Field, PasswordField } from "./AuthLayout";
import { validateEmail } from "./authValidation";

export function LoginPage() {
  const { signIn, user, configured } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in, or signed in from another tab: nothing to do here.
  useEffect(() => {
    if (user) navigate("/");
  }, [user]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const emailError = validateEmail(email);
    // Sign-in deliberately does not check the password format. The rules may
    // have changed since the account was made, and the server is the authority.
    const passwordError = password.length === 0 ? "Enter your password." : undefined;

    setFieldErrors({ email: emailError ?? undefined, password: passwordError });
    if (emailError || passwordError) return;

    setSubmitting(true);
    setFormError(null);

    try {
      await signIn({ email: email.trim(), password });
      navigate("/");
    } catch (cause) {
      setFormError((cause as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up your history and your best result."
      footer={
        <>
          <span>New here?</span>{" "}
          <a href="#/register">Create an account</a>
        </>
      }
    >
      {!configured && (
        <p className="warning-banner" role="status">
          Accounts are not switched on yet because Supabase is not connected. You can still{" "}
          <a href="#/build">take a test as a guest</a>.
        </p>
      )}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className="error-banner" role="alert">
            {formError}
          </p>
        )}

        <Field
          id="login-email"
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
          id="login-password"
          label="Password"
          autoComplete="current-password"
          placeholder="Your password"
          value={password}
          error={fieldErrors.password}
          disabled={submitting || !configured}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button type="submit" className="primary-button auth-submit" disabled={submitting || !configured}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}
