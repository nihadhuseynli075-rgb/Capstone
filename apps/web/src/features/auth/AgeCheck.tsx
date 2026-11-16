import { useEffect, useRef, useState } from "react";
import { MIN_ACCOUNT_AGE, birthYearProblem, latestAccountBirthYear, parseBirthYear } from "@grade9/shared";
import { navigate } from "../../app/router";
import { fill, useLanguage } from "../../lib/i18n";
import { useAuth } from "./AuthContext";
import { AuthLayout, Field, focusFirstError } from "./AuthLayout";

/**
 * The year-of-birth step: what a signed-in account sees first, wherever it
 * is, until it has given the year it was born.
 *
 * Accounts are for students of MIN_ACCOUNT_AGE and over (packages/shared), and
 * the API uses nothing of an account until it knows. A Google sign-up has not
 * been asked, nor has an account made before the check; an email sign-up gave
 * its year on the form, and that one is sent from here without asking again.
 *
 * Too young, the API deletes the account there and then, everything in it,
 * and this browser is signed out of it; `onRefused` then shows TooYoungNotice.
 * The page says so before the year is sent.
 */
export function AgeCheckPage({ onRefused }: { onRefused: () => void }) {
  const { t } = useLanguage();
  const { user, confirmAge, signOut } = useAuth();

  const [year, setYear] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const latestYear = latestAccountBirthYear();
  const fromSignUp = user?.signUpBirthYear ?? null;
  const sentFromSignUp = useRef(false);

  async function send(birthYear?: number) {
    setSaving(true);
    setFormError(null);

    try {
      const outcome = await confirmAge(birthYear);
      if (outcome === "account-deleted") onRefused();
      // Recorded: the refreshed session says so, and the app moves on by itself.
    } catch {
      setFormError(t("age.errFailed"));
      setSaving(false);
    }
  }

  // The year from the sign-up form, sent once. Failing that, the form below.
  useEffect(() => {
    if (fromSignUp === null || sentFromSignUp.current) return;
    sentFromSignUp.current = true;
    void send();
    // Only ever once for the year it has: send is remade on every render.
  }, [fromSignUp]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const typed = parseBirthYear(year);

    // Only a year nobody could be born in is refused here. One too late for an
    // account is sent like any other: the account exists, and the API is what
    // deletes it.
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
      footer={
        <button type="button" className="link-button" onClick={() => void signOut()}>
          {t("nav.signOut")}
        </button>
      }
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
 * sent nothing, or after the year-of-birth step has deleted the account. The
 * way on is the practice that needs no account.
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
