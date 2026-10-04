import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useLanguage } from "../../lib/i18n";
import { useAuth } from "../auth/AuthContext";
import { Field } from "../auth/AuthLayout";
import { emailProblem } from "../auth/authValidation";
import { emailProblemText, errorText, fill } from "./profileText";
import { useProfile } from "./ProfileContext";

/**
 * Changing the email address.
 *
 * Supabase does not swap the address when it is asked to. It emails a link to
 * the new one and the address changes once that link is opened, so this panel
 * spends most of its effort telling the student exactly that: until they open
 * the email, nothing has changed and the old address is still the one to sign
 * in with.
 *
 * Google-only accounts are the exception, and are not offered the change. An
 * account made with Google has no password, so its address is only ever used
 * to match the Google sign-in. Moving it to another address would leave an
 * email "way in" with no password behind it: Supabase would count the account
 * as having one, the sign-in methods panel would let Google be disconnected on
 * the strength of it, and the student would be locked out. Once a password is
 * set the account can sign in by email, and the change is offered like anyone's.
 */
export function EmailPanel({ email, googleOnly }: { email: string; googleOnly: boolean }) {
  const { t } = useLanguage();
  const { user, updateEmail, refreshUser } = useAuth();
  // The profile row mirrors the account's address, so it is asked again when that moves.
  const { reload } = useProfile();

  const pending = user?.pendingEmail ?? null;

  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Read by the focus check, which must not start while a request it could
  // collide with is under way.
  const savingRef = useRef(false);

  // While a change is waiting, the student is off reading their inbox. Coming
  // back to this tab asks Supabase whether the link has been opened since, so
  // a link opened in another browser or on a phone shows up here without a
  // reload. It also asks once as the panel opens: the stored session still
  // says "waiting" after a reload, however long ago the link was opened.
  // The auth calls run one at a time (see AuthContext), and the check is
  // skipped while this panel's own request is out.
  useEffect(() => {
    if (!pending) return;

    function check() {
      if (document.visibilityState !== "visible" || savingRef.current) return;
      void refreshUser().catch(() => undefined);
    }

    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [pending, refreshUser]);

  // A waiting address turning into the account's own means the link was opened.
  const waitingFor = useRef<string | null>(pending);
  useEffect(() => {
    const was = waitingFor.current;
    waitingFor.current = pending;

    if (was && !pending && user && user.email.toLowerCase() === was.toLowerCase()) {
      setNotice({ ok: true, text: fill(t("profile.emailChanged"), { email: user.email }) });
    }
  }, [pending, user, t]);

  /** Asks Supabase for the change: what it did, or the sentence to show when it refused. */
  async function request(address: string): Promise<{ applied: boolean } | string> {
    try {
      return await updateEmail(address);
    } catch (cause) {
      // "validation_failed" is Supabase's catch-all, and on this form it can
      // only mean the address.
      return errorText(cause, t, { validation_failed: "profile.errEmailInvalid" });
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);

    const address = value.trim();
    const problem = emailProblem(address);
    if (problem) {
      setError(emailProblemText(problem, t));
      return;
    }

    if (user && address.toLowerCase() === user.email.toLowerCase()) {
      setError(t("profile.emailSame"));
      return;
    }

    setError(null);
    setSaving(true);
    savingRef.current = true;
    const result = await request(address);
    savingRef.current = false;
    setSaving(false);

    if (typeof result === "string") {
      setError(result);
      return;
    }

    setValue("");

    // A project with confirmation switched off applies the change at once.
    if (result.applied) {
      reload();
      setNotice({ ok: true, text: fill(t("profile.emailChanged"), { email: address }) });
    }
    // Otherwise the account now lists the waiting address, and the notice
    // above the form is what says so.
  }

  async function handleResend() {
    if (!pending) return;

    setNotice(null);
    setSaving(true);
    savingRef.current = true;
    const result = await request(pending);
    savingRef.current = false;
    setSaving(false);

    setNotice(
      typeof result === "string"
        ? { ok: false, text: result }
        : { ok: true, text: fill(t("profile.emailResent"), { email: pending }) }
    );
  }

  return (
    <section className="panel settings-panel">
      <h2>{t("profile.emailTitle")}</h2>

      {googleOnly && <p className="panel-hint">{t("profile.emailGoogleOnly")}</p>}

      {notice && (
        <p className={notice.ok ? "success-banner" : "error-banner"} role={notice.ok ? "status" : "alert"}>
          {notice.text}
        </p>
      )}

      {pending && (
        <div className="warning-banner notice-block" role="status">
          {/* The account's address, not the profile's: the profile row follows
              the change the moment it is confirmed, while the address still
              to sign in with is the account's until this tab hears of it. */}
          <p>{fill(t("profile.emailPending"), { email: pending, current: user?.email || email })}</p>
          <p>{t("profile.emailPendingNote")}</p>
          <button type="button" className="link-button" onClick={handleResend} disabled={saving}>
            {t("profile.emailResend")}
          </button>
        </div>
      )}

      <form className="settings-form" onSubmit={handleSubmit} noValidate>
        <Field
          id="profile-email"
          label={t("profile.email")}
          type="email"
          value={email}
          disabled
          readOnly
          onChange={() => undefined}
        />

        {!googleOnly && (
          <>
            <Field
              id="profile-new-email"
              label={t("profile.newEmail")}
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={value}
              error={error}
              hint={pending ? t("profile.emailPendingFix") : t("profile.emailHint")}
              disabled={saving}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
            />

            <div className="settings-actions">
              <button type="submit" className="primary-button" disabled={saving || value.trim().length === 0}>
                {saving ? t("profile.sendingEmail") : t("profile.changeEmail")}
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  );
}
