import { useId, useState } from "react";
import type { ReportReason } from "@grade9/shared";
import { reportLimits, reportReasons } from "@grade9/shared";
import { useLanguage, type TranslationKey } from "../../lib/i18n";
import { ApiError } from "../../services/apiClient";
import { reportQuestion } from "../../services/testsApi";
import { fill } from "../friends/fill";
import { studentTestErrorText } from "./studentTestText";

/**
 * "Report a problem" under a reviewed question (session of 18 Nov 2026):
 * the student says what is wrong (the answer key, no right option, cannot be
 * solved, unclear) and the question goes to the admin's Reported questions.
 * Student-made tests are published without a check, so this is how a wrong
 * one is found; it works on any question.
 */
export function ReportQuestion({
  attemptId,
  position,
  number,
  alreadyReported
}: {
  attemptId: string;
  position: number;
  /** The question's number as the page shows it ("Q4"). */
  number: number;
  alreadyReported: boolean;
}) {
  const { t } = useLanguage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("wrong-answer");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">(alreadyReported ? "sent" : "idle");
  const [error, setError] = useState<unknown>(null);

  if (state === "sent") {
    return (
      <p className="report-done" role="status">
        {alreadyReported ? t("report.already") : t("report.sent")}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="link-button report-open"
        aria-label={fill(t("report.buttonAria"), { n: String(number) })}
        onClick={() => setOpen(true)}
      >
        {t("report.button")}
      </button>
    );
  }

  async function send() {
    setState("sending");
    setError(null);
    try {
      await reportQuestion(attemptId, { position, reason, details: details.trim() });
      setState("sent");
    } catch (cause) {
      // Reported already, from another tab: what was asked for has happened.
      if (cause instanceof ApiError && cause.code === "already-reported") {
        setState("sent");
        return;
      }
      setError(cause);
      setState("idle");
    }
  }

  return (
    <form
      className="report-form"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <p className="report-title" id={`${id}-title`}>
        {t("report.title")}
      </p>
      <fieldset className="report-reasons">
        <legend className="visually-hidden">{t("report.title")}</legend>
        {reportReasons.map((choice) => (
          <label key={choice} className="report-reason">
            <input
              type="radio"
              name={`${id}-reason`}
              checked={reason === choice}
              onChange={() => setReason(choice)}
            />
            <span>{t(`report.reason.${choice}` as TranslationKey)}</span>
          </label>
        ))}
      </fieldset>
      <label className="report-details">
        <span>{t("report.details")}</span>
        <textarea
          rows={2}
          value={details}
          maxLength={reportLimits.maxDetails}
          onChange={(event) => setDetails(event.currentTarget.value)}
        />
      </label>
      {error !== null && (
        <p className="error-banner" role="alert">
          {studentTestErrorText(error, t)}
        </p>
      )}
      <div className="report-actions">
        <button type="submit" className="primary-button" disabled={state === "sending"}>
          {state === "sending" ? t("report.sending") : t("report.send")}
        </button>
        <button type="button" className="ghost-button" disabled={state === "sending"} onClick={() => setOpen(false)}>
          {t("report.cancel")}
        </button>
      </div>
    </form>
  );
}
