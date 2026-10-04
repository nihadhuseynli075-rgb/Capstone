import { useState } from "react";
import type { ReactNode } from "react";
import { LogoStacked, Wordmark } from "../../lib/brand";

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
        {/* The brand panel is hidden on a phone, so this is the way home there. */}
        <a href="#/" className="auth-mobile-brand">
          <Wordmark size={28} />
        </a>

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

/** The rule between the Google button and the email form, with a word in the middle. */
export function AuthDivider({ label }: { label: string }) {
  return <p className="auth-divider">{label}</p>;
}

/**
 * Moves focus to the first field with an error, once the page has drawn the
 * message under it.
 *
 * A form that only painted its errors left focus on the submit button: a
 * screen reader said nothing, and on a phone the first error could be above
 * the fold. Focused, the field is scrolled into view and read out with its
 * error, which Field links to it through aria-describedby. Pass the id of
 * every field in form order, or a falsy value for one without an error.
 *
 * A field is often disabled while its form is sending, and a disabled field
 * cannot take focus, so this waits a few frames for it to be enabled again.
 */
export function focusFirstError(...fieldIds: Array<string | false | null | undefined>): void {
  const id = fieldIds.find((fieldId): fieldId is string => typeof fieldId === "string" && fieldId.length > 0);
  if (!id) return;

  let framesLeft = 10;

  function attempt() {
    const field = document.getElementById(id as string) as HTMLInputElement | null;

    if (field && !field.disabled) field.focus();
    else if ((framesLeft -= 1) > 0) window.requestAnimationFrame(attempt);
  }

  window.requestAnimationFrame(attempt);
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
  // The hint is only drawn while there is no error, so it is only named then.
  const describedBy = [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null]
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

/** The words on a password field's show/hide button, for a page that is not in English. */
export interface PasswordToggleLabels {
  show: string;
  hide: string;
  showAria: string;
  hideAria: string;
}

const ENGLISH_TOGGLE: PasswordToggleLabels = {
  show: "Show",
  hide: "Hide",
  showAria: "Show password",
  hideAria: "Hide password"
};

/**
 * Password input with a show/hide toggle.
 *
 * Typing a password blind on a phone keyboard is where most sign-in attempts go
 * wrong, so revealing it is one tap away. The sign-in and sign-up pages are in
 * English and take the default words; the profile page passes its own.
 */
export function PasswordField({
  id,
  label,
  error,
  hint,
  toggleLabels = ENGLISH_TOGGLE,
  ...inputProps
}: {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  toggleLabels?: PasswordToggleLabels;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  // The hint is only drawn while there is no error, so it is only named then.
  const describedBy = [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null]
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
          aria-label={visible ? toggleLabels.hideAria : toggleLabels.showAria}
          aria-pressed={visible}
        >
          {visible ? toggleLabels.hide : toggleLabels.show}
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
