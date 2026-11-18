import { useCallback, useEffect, useState } from "react";
import type { QuestionReport, ReportReason, ReportStatus } from "@grade9/shared";
import { readableAnswer, subjectName } from "@grade9/shared";
import { ApiError } from "../services/apiClient";
import { fetchReports, setReportStatus, unpublishReportedTest } from "../services/adminApi";
import { MathText } from "./MathText";

/**
 * Reported questions (session of 18 Nov 2026): questions students reported as
 * wrong, impossible or unclear after handing a test in. Each shows the
 * question as the student saw it, with its answer key, why it was reported,
 * and where it came from: the bank, with a way to edit it, or a test a student
 * made, which can be taken off the published list.
 *
 * The dashboard is in English, as the rest of it is.
 */

const REASONS: Record<ReportReason, string> = {
  "wrong-answer": "The answer key is wrong",
  "no-correct-answer": "No option is right",
  impossible: "It cannot be solved",
  unclear: "Unclear or a typo",
  other: "Something else"
};

const FILTERS: Array<{ id: ReportStatus | "all"; label: string }> = [
  { id: "open", label: "Open" },
  { id: "resolved", label: "Fixed" },
  { id: "dismissed", label: "Nothing wrong" },
  { id: "all", label: "All" }
];

export function AdminReports({
  onSessionEnded,
  onEditQuestion,
  onOpenCount
}: {
  onSessionEnded: () => void;
  /** Opens a bank question in the form, when the list has it. False when it does not. */
  onEditQuestion: (questionId: string) => boolean;
  /** Tells the page how many are open, for the tab's count. */
  onOpenCount: (count: number) => void;
}) {
  const [filter, setFilter] = useState<ReportStatus | "all">("open");
  const [reports, setReports] = useState<QuestionReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fail = useCallback(
    (cause: unknown) => {
      if (cause instanceof ApiError && cause.status === 401) return onSessionEnded();
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    },
    [onSessionEnded]
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const { reports: found } = await fetchReports(filter);
      setReports(found);
      if (filter === "open") onOpenCount(found.length);
    } catch (cause) {
      fail(cause);
    }
  }, [filter, fail, onOpenCount]);

  useEffect(() => {
    setReports(null);
    void load();
  }, [load]);

  async function close(report: QuestionReport, status: ReportStatus) {
    setBusy(report.id);
    setNotice(null);
    try {
      await setReportStatus(report.id, status);
      setNotice(status === "open" ? "Opened again." : status === "resolved" ? "Marked as fixed." : "Marked as nothing wrong.");
      await load();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(null);
    }
  }

  async function unpublish(report: QuestionReport) {
    setBusy(report.id);
    setNotice(null);
    try {
      const { studentTest } = await unpublishReportedTest(report.id);
      setNotice(`"${studentTest.title}" is back to its maker's friends only.`);
      await load();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-reports">
      <h2>Reported questions</h2>
      <p className="panel-hint">
        Students report a question from their results after handing a test in. Tests made by students are published
        without a check, so this is where a wrong one shows up. Fix the question, or take a student&apos;s test off the
        published list, then mark the report as fixed.
      </p>

      <div className="chip-row" role="group" aria-label="Show reports">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`chip${filter === option.id ? " selected" : ""}`}
            aria-pressed={filter === option.id}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      {reports === null && !error && (
        <p className="panel-hint" role="status">
          Loading reports...
        </p>
      )}
      {reports && reports.length === 0 && (
        <p className="panel-hint">{filter === "open" ? "No open reports. Nothing to check." : "None here."}</p>
      )}

      {reports && reports.length > 0 && (
        <ul className="admin-report-list">
          {reports.map((report) => (
            <li key={report.id} className={`admin-report status-${report.status}`}>
              <div className="admin-report-head">
                <span className="admin-chip">{REASONS[report.reason]}</span>
                <span className="admin-report-where">
                  {subjectName(report.subjectId)} ·{" "}
                  {report.studentTest
                    ? `student test "${report.studentTest.title}" (${report.studentTest.visibility === "public" ? "published" : "friends only"})`
                    : report.questionId
                      ? "question bank"
                      : "no longer in the bank or a test"}
                </span>
                <time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString("en-GB")}</time>
              </div>

              <p className="admin-report-prompt">
                <MathText text={report.prompt} />
              </p>
              {report.imageUrl && <img className="question-image" src={report.imageUrl} alt="The question's picture" />}
              {report.options.length > 0 && (
                <ol className="admin-report-options" type="A">
                  {report.options.map((option, index) => (
                    <li key={index}>
                      <MathText text={option} />
                    </li>
                  ))}
                </ol>
              )}
              <p>
                <strong>Answer key: </strong>
                <MathText text={readableAnswer(report.options.length ? "multiple-select" : "short-answer", report.correctAnswer)} />
              </p>
              {report.details && (
                <p className="admin-report-details">
                  <strong>Student says: </strong>
                  {report.details}
                </p>
              )}

              <div className="admin-report-actions">
                {report.questionId && (
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy !== null}
                    onClick={() => {
                      if (!onEditQuestion(report.questionId as string)) {
                        setNotice("That question is not in the loaded list. Find it under All questions.");
                      }
                    }}
                  >
                    Edit the question
                  </button>
                )}
                {report.studentTest?.visibility === "public" && (
                  <button
                    type="button"
                    className="danger-button"
                    disabled={busy !== null}
                    onClick={() => void unpublish(report)}
                  >
                    Take the test off the published list
                  </button>
                )}
                {report.status === "open" ? (
                  <>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy !== null}
                      onClick={() => void close(report, "resolved")}
                    >
                      Mark as fixed
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy !== null}
                      onClick={() => void close(report, "dismissed")}
                    >
                      Nothing wrong
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy !== null}
                    onClick={() => void close(report, "open")}
                  >
                    Open again
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
