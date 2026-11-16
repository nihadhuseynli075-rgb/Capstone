import { useEffect, useRef, useState } from "react";
import { MIN_ACCOUNT_AGE, birthYearProblem, latestAccountBirthYear, parseBirthYear } from "@grade9/shared";
import { navigate } from "../../app/router";
import { fill, useLanguage } from "../../lib/i18n";
import { ApiError } from "../../services/apiClient";
import { useAuth } from "./AuthContext";
import { AuthLayout, Field, focusFirstError } from "./AuthLayout";

/**
 * The year-of-birth step: what a new account sees first, wherever it is,
 * until it has given the year it was born. Accounts made before the check
 * began never see it (see AgeStatus in AuthContext).
 *
 * Accounts are for students of MIN_ACCOUNT_AGE and over (packages/shared), and
 * the API uses nothing of a new account until it knows. A Google sign-up has
 * not been asked; an email sign-up gave its year on the form, and that one is
 * sent from here without asking again.
 *
 * A year too late for an account is shown back first, so a slip can be put
 * right ("Change the year"). Only "Yes, it is right" has the API delete the
 * new account, and only when it holds nothing, as a new account should; this
 * browser is signed out of it, and `onRefused` then shows TooYoungNotice. One
 * that already holds tests, friends or a photo is not deleted but locked, for
 * a person to look at ("account-not-empty"), and the step says it is on hold.
 * Anything done as a guest before signing in stays as it was.
 */
export function AgeCheckPage({ onRefused }: { onRefused: () => void }) {
  const { t } = useLanguage();
  const { user, confirmAge, signOut } = useAuth();

  const [year, setYear] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A year too late for an account, shown back before anything is deleted.
  const [tooYoung, setTooYoung] = useState<number | null>(null);
  // Refused, but the account holds something, so the API kept it, locked, for
  // a person to look at (see the year route in the API) rather than delete it.
  const [onHold, setOnHold] = useState(false);

  const latestYear = latestAccountBirthYear();
  const fromSignUp = user?.signUpBirthYear ?? null;
  const sentFromSignUp = useRef(false);

  async function send(birthYear?: number, confirmTooYoung = false) {
    setSaving(true);
    setFormError(null);

    try {
      const answer = await confirmAge(birthYear, confirmTooYoung);

      if (answer.outcome === "too-young") {
        setYear(String(answer.birthYear));
        setTooYoung(answer.birthYear);
        setSaving(false);
        return;
      }

      if (answer.outcome === "account-deleted") onRefused();
      // Recorded: the refreshed session says so, and the app moves on by itself.
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "account-not-empty") {
        setTooYoung(null);
        setOnHold(true);
        setSaving(false);
        return;
      }
      setFormError(t("age.errFailed"));
      setSaving(false);
    }
  }

  // The year from the sign-up form, sent once. Failing that, the form below.
  // (Above the screens below: hooks run in the same order on every render.)
  useEffect(() => {
    if (fromSignUp === null || sentFromSignUp.current) return;
    sentFromSignUp.current = true;
    void send();
    // Only ever once for the year it has: send is remade on every render.
  }, [fromSignUp]);

  const signOutButton = (
    <button type="button" className="link-button" onClick={() => void signOut()}>
      {t("nav.signOut")}
    </button>
  );

  if (onHold) {
    return (
      <AuthLayout title={t("age.onHoldTitle")} subtitle={t("age.onHoldBody")} guestLink={false} footer={signOutButton}>
        {null}
      </AuthLayout>
    );
  }

  if (tooYoung !== null) {
    return (
      <AuthLayout
        title={fill(t("age.checkTitle"), { year: tooYoung })}
        subtitle={fill(t("age.checkBody"), { year: tooYoung, latest: latestYear })}
        guestLink={false}
        footer={signOutButton}
      >
        {formError && (
          <p className="error-banner" role="alert">
            {formError}
          </p>
        )}

        <div className="auth-form">
          {/* The safe answer is the main button, and has focus: deleting
              needs a deliberate second press. */}
          <button
            type="button"
            className="primary-button auth-submit"
            autoFocus
            disabled={saving}
            onClick={() => {
              setTooYoung(null);
              setFormError(null);
              focusFirstError("age-birth-year");
            }}
          >
            {t("age.change")}
          </button>
          <button
            type="button"
            className="ghost-button auth-submit"
            disabled={saving}
            onClick={() => void send(tooYoung, true)}
          >
            {saving ? t("age.deleting") : fill(t("age.confirmTooYoung"), { year: tooYoung })}
          </button>
        </div>
      </AuthLayout>
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const typed = parseBirthYear(year);

    // Only a year nobody could be born in is refused here. One too late for an
    // account is sent like any other: the API answers "too-young" without
    // changing anything, and the page shows it back (above).
    if (typed === null || birthYearProblem(typed) === "invalid") {
      setFieldError(t("auth.errBirthYear"));
      focusFirstError("age-birth-year");
      return;
    }

    setFieldError(null);
    void send(typed);
  }

  const checkingSignUpYear = fromSignUp !== null && saving && formError === null;

  return (
    <AuthLayout
      title={t("age.title")}
      subtitle={fill(t("age.subtitle"), { age: MIN_ACCOUNT_AGE })}
      guestLink={false}
      footer={signOutButton}
    >
      {formError && (
        <p className="error-banner" role="alert">
          {formError}
        </p>
      )}

      {checkingSignUpYear ? (
        <p className="panel-hint" role="status">
          {t("age.saving")}
        </p>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <Field
            id="age-birth-year"
            label={t("auth.birthYear")}
            type="text"
            inputMode="numeric"
            autoComplete="bday-year"
            maxLength={4}
            value={year}
            error={fieldError}
            disabled={saving}
            onChange={(event) => setYear(event.target.value)}
          />

          <p className="auth-legal-notice">{fill(t("age.notice"), { year: latestYear })}</p>

          <button type="submit" className="primary-button auth-submit" disabled={saving}>
            {saving ? t("age.saving") : t("age.continue")}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

/**
 * What a student too young for an account is told: by the sign-up form, which
 * sent nothing, or after the year-of-birth step has deleted the new account.
 * The way on is the practice that needs no account, with anything done as a
 * guest before signing in still there.
 */
export function TooYoungNotice({ onContinue }: { onContinue?: () => void }) {
  const { t } = useLanguage();

  return (
    <AuthLayout
      title={t("age.tooYoungTitle")}
      subtitle={fill(t("age.tooYoungBody"), { year: latestAccountBirthYear() })}
      footer={<span>{t("main.noAccountNeeded")}</span>}
    >
      <button
        type="button"
        className="primary-button auth-submit"
        onClick={() => {
          // The step may have been on the test builder already, where going
          // there changes nothing; the message is put away either way.
          onContinue?.();
          navigate("/build");
        }}
      >
        {t("main.startPractice")}
      </button>
    </AuthLayout>
  );
}
