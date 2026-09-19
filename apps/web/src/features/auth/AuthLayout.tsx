import { useState } from "react";
import type { ReactNode } from "react";
import { LogoStacked } from "../../lib/brand";

/**
 * The shell both auth screens sit in.
 *
 * Two columns on a wide screen: the brand panel on the left carries the reason
 * to sign up, the form sits on the right. Below 900px the brand panel is hidden
 * outright rather than stacked, because on a phone it would push the form -- the
 * only thing anyone came here to use -- below the fold.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="auth-layout">
      <aside className="auth-aside" aria-hidden="true">
        <LogoStacked size={54} tone="light" />
        <p className="auth-aside-title">
          Practise the real exam, then find out exactly what to fix.
        </p>
        <ul className="auth-aside-points">
          <li>Mock tests built from real past-paper questions</li>
          <li>Marked instantly, with the reason behind every mistake</li>
          <li>Your history and best result, saved to your account</li>
        </ul>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <header className="auth-card-head">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </header>

          {children}

          <footer className="auth-card-foot">{footer}</footer>
        </div>
      </main>
    </div>
  );
}

/** A labelled input that shows its error underneath and links the two for screen readers. */
export function Field({
  id,
  label,
  error,
  hint,
  ...inputProps
}: {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy.length > 0 ? describedBy : undefined}
        className={error ? "has-error" : undefined}
        {...inputProps}
      />
      {hint && !error && (
        <p className="auth-field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="auth-field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Password input with a show/hide toggle.
 *
 * Typing a password blind on a phone keyboard is where most sign-in attempts go
 * wrong, so revealing it is one tap away.
 */
export function PasswordField({
  id,
  label,
  error,
  hint,
  ...inputProps
}: {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy.length > 0 ? describedBy : undefined}
          className={error ? "has-error" : undefined}
          {...inputProps}
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {hint && !error && (
        <p className="auth-field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="auth-field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
