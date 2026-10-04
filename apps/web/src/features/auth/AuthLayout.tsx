import { useState } from "react";
import type { ReactNode } from "react";
import { LanguageSelect, ThemeToggle } from "../../components/SiteControls";
import { LogoStacked, Wordmark } from "../../lib/brand";
import { useLanguage } from "../../lib/i18n";

/**
 * The shell both auth screens sit in.
 *
 * Two columns on a wide screen: the brand panel on the left carries the reason
 * to sign up, the form sits on the right. Below 900px the brand panel is hidden
 * outright rather than stacked, because on a phone it would push the form -- the
 * only thing anyone came here to use -- below the fold. The brand panel is a
 * picture, so the way home and the way to a test without an account are
 * links in the form's column, at every width.
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
  const { t } = useLanguage();

  return (
    <div className="auth-layout">
      <aside className="auth-aside" aria-hidden="true">
        <LogoStacked size={54} tone="light" />
        <p className="auth-aside-title">{t("auth.asideTitle")}</p>
        <ul className="auth-aside-points">
          <li>{t("auth.asidePoint1")}</li>
          <li>{t("auth.asidePoint2")}</li>
          <li>{t("auth.asidePoint3")}</li>
        </ul>
      </aside>

      <main className="auth-panel">
        <div className="auth-topbar">
          <a href="#/" className="auth-home-link">
            <Wordmark size={28} />
          </a>

          {/* These pages have no header bar, and a student may arrive here
              first: the language and the theme are chosen here too. */}
          <div className="auth-controls">
            <LanguageSelect />
            <ThemeToggle />
          </div>
        </div>

        <div className="auth-card">
          <header className="auth-card-head">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </header>

          {children}

          <footer className="auth-card-foot">{footer}</footer>
        </div>

        <p className="auth-guest-link">
          <a href="#/build">{t("auth.guestTest")}</a>
        </p>
      </main>
    </div>
  );
}

/** The rule between the Google button and the email form, with a word in the middle. */
export function AuthDivider({ label }: { label: string }) {
  return <p className="auth-divider">{label}</p>;
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

/** The words on a password field's show/hide button. */
export interface PasswordToggleLabels {
  show: string;
  hide: string;
  showAria: string;
  hideAria: string;
}

/**
 * Password input with a show/hide toggle.
 *
 * Typing a password blind on a phone keyboard is where most sign-in attempts go
 * wrong, so revealing it is one tap away. The button's words are in the site
 * language unless a page passes its own.
 */
export function PasswordField({
  id,
  label,
  error,
  hint,
  toggleLabels,
  ...inputProps
}: {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  toggleLabels?: PasswordToggleLabels;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const labels = toggleLabels ?? {
    show: t("profile.showPassword"),
    hide: t("profile.hidePassword"),
    showAria: t("profile.showPasswordAria"),
    hideAria: t("profile.hidePasswordAria")
  };
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
          aria-label={visible ? labels.hideAria : labels.showAria}
          aria-pressed={visible}
        >
          {visible ? labels.hide : labels.show}
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
