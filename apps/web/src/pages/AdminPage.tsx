import { useCallback, useEffect, useRef, useState } from "react";
import type { BankQuestion, QuestionDraft, QuestionStatus } from "@grade9/shared";
import { followsSiteLanguage, markLimits, siteLanguages, subjectName, topicName } from "@grade9/shared";
import { QuestionForm, type QuestionCarryOver } from "../components/QuestionForm";
import { useLanguage } from "../lib/i18n";
import { ApiError } from "../services/apiClient";
import {
  adminLogin,
  createQuestion,
  deleteQuestion,
  fetchQuestions,
  getAdminToken,
  importQuestions,
  setAdminToken,
  updateQuestion,
  type ImportResponse
} from "../services/adminApi";

const CSV_TEMPLATE =
  "subject,topic,difficulty,type,question,option_a,option_b,option_c,option_d,option_e,correct_answer,marks,explanation,paper_year,source";

type Tab = "add" | "list" | "import";

/**
 * The most a dropped sheet may be. A question sheet is a few hundred kilobytes
 * at the very most, so a file this size is the wrong file, and reading it into
 * the box would freeze the page for nothing.
 */
const MAX_SHEET_BYTES = 2 * 1024 * 1024;

/** Why a question is not in tests yet. Saving it complete through the form makes it ready. */
const statusLabel: Record<Exclude<QuestionStatus, "ready">, string> = {
  draft: "Draft - not in tests until its options and answer are added",
  "image-pending": "Image coming soon - not in tests until its picture is added"
};

function LoginScreen({ onSignedIn }: { onSignedIn: (storageMode: string, isDefault: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result = await adminLogin(password);
      setAdminToken(result.token);
      onSignedIn(result.storageMode, result.usingDefaultPassword);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack narrow">
      <section>
        <h1>Admin dashboard</h1>
        <p className="lede">Sign in to add and manage the questions students are tested on.</p>
      </section>

      <form className="panel" onSubmit={handleSubmit}>
        <label>
          Admin password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            autoComplete="current-password"
          />
        </label>

        {error && <p className="error-banner">{error}</p>}

        <button type="submit" className="primary-button" disabled={busy || password.length === 0}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export function AdminPage() {
  const { t } = useLanguage();
  const [token, setToken] = useState<string | null>(() => getAdminToken());
  const [tab, setTab] = useState<Tab>("add");

  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [storageMode, setStorageMode] = useState<string>("");
  const [writtenMarking, setWrittenMarking] = useState(true);
  const [usingDefaultPassword, setUsingDefaultPassword] = useState(false);

  const [subjectFilter, setSubjectFilter] = useState("");
  // What is typed, and what has actually been asked for. Kept apart so the
  // bank is not queried once per keystroke.
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [editing, setEditing] = useState<BankQuestion | null>(null);
  const [saving, setSaving] = useState(false);
  // Set the moment a save starts, ahead of the state above reaching the page,
  // so a second press of the button cannot start a second save.
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);

  // The form is emptied by giving it a new key, which remounts it. After a
  // question is added the next one starts clean, with what a paper shares kept.
  const [formKey, setFormKey] = useState(0);
  const [carryOver, setCarryOver] = useState<QuestionCarryOver | null>(null);

  const [csv, setCsv] = useState("");
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [importing, setImporting] = useState(false);
  // The drop zone: whether a file is being dragged over it, and how the last one went.
  const [dragging, setDragging] = useState(false);
  const [sheetNote, setSheetNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  /** Moving to another tab clears the last banner; it no longer applies there. */
  function switchTab(next: Tab) {
    setTab(next);
    setNotice(null);
    setError(null);
    if (next !== "add") setEditing(null);
  }

  /** Any 401 means the API restarted or the session expired: show login again. */
  const handleFailure = useCallback((cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) {
      setAdminToken(null);
      setToken(null);
      return;
    }
    setError((cause as Error).message);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchQuestions({
        subject: subjectFilter || undefined,
        search: searchQuery || undefined
      });
      setQuestions(data.questions);
      setStorageMode(data.storageMode);
      setWrittenMarking(data.writtenMarking ?? true);
      // Re-read on every listing rather than only at sign-in: the token outlives
      // a page reload, so a warning that arrived once with the login reply was
      // gone the moment the page was refreshed.
      setUsingDefaultPassword(data.usingDefaultPassword);
      setError(null);
    } catch (cause) {
      handleFailure(cause);
    }
  }, [subjectFilter, searchQuery, handleFailure]);

  // Typing settles before the bank is asked. Without this every letter of a
  // search term was its own round trip, and the answers could land out of order.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (token) void refresh();
  }, [token, refresh]);

  // The form is long, so the person pressing its button is a long way down the
  // page and a message at the top went unseen. It sits under the form instead
  // (see below), and is brought into view in case the page has since shrunk.
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ block: "nearest" });
  }, [notice]);

  if (!token) {
    return (
      <LoginScreen
        onSignedIn={(mode, isDefault) => {
          setStorageMode(mode);
          setUsingDefaultPassword(isDefault);
          setToken(getAdminToken());
        }}
      />
    );
  }

  async function handleSave(draft: QuestionDraft) {
    if (savingRef.current) return;
    savingRef.current = true;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      if (editing) {
        await updateQuestion(editing.id, draft);
        setNotice("Question updated.");
        setEditing(null);
      } else {
        await createQuestion(draft);
        setNotice("Question added to the bank. Subject, topic, difficulty, year and source are kept for the next one.");
        // The form kept the whole question, so a second press saved it again
        // and the next one began with this one's options and explanation.
        setCarryOver({
          subjectId: draft.subjectId,
          topicId: draft.topicId,
          difficulty: draft.difficulty,
          paperYear: draft.paperYear,
          source: draft.source
        });
        setFormKey((current) => current + 1);
      }
      await refresh();
    } catch (cause) {
      handleFailure(cause);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleDelete(question: BankQuestion) {
    if (!window.confirm(`Delete this question?\n\n${question.prompt.slice(0, 120)}`)) return;

    try {
      await deleteQuestion(question.id);
      setNotice("Question deleted.");
      if (editing?.id === question.id) setEditing(null);
      await refresh();
    } catch (cause) {
      handleFailure(cause);
    }
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const result = await importQuestions(csv);
      setImportResult(result);
      if (result.importedCount > 0) setCsv("");
      await refresh();
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setImporting(false);
    }
  }

  /**
   * Puts a dropped or chosen sheet into the box, where the paste would have
   * gone. It is not imported from here: the person sees what was loaded and
   * presses the same button, so a file and a paste go through one path.
   */
  async function loadSheet(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    const fileCount = files?.length ?? 0;
    setImportResult(null);

    // Judged by name: a CSV saved on Windows often has no type at all.
    if (!/\.(csv|tsv)$/i.test(file.name)) {
      setSheetNote({ kind: "error", text: t("import.notSheet") });
      return;
    }

    if (file.size === 0) {
      setSheetNote({ kind: "error", text: t("import.empty") });
      return;
    }

    if (file.size > MAX_SHEET_BYTES) {
      setSheetNote({ kind: "error", text: t("import.tooBig") });
      return;
    }

    try {
      const text = await file.text();

      if (text.trim().length === 0) {
        setSheetNote({ kind: "error", text: t("import.empty") });
        return;
      }

      setCsv(text);
      setSheetNote({
        kind: "success",
        text: `${t("import.loaded")} ${file.name}. ${t("import.loadedHint")}${fileCount > 1 ? ` ${t("import.firstOnly")}` : ""}`
      });
    } catch {
      setSheetNote({ kind: "error", text: t("import.unreadable") });
    }
  }

  return (
    <div className="stack">
      <section className="admin-head">
        <div>
          <h1>Admin dashboard</h1>
          <p className="lede">{questions.length} questions in the bank.</p>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            setAdminToken(null);
            setToken(null);
          }}
        >
          Sign out
        </button>
      </section>

      {storageMode === "memory" && (
        <p className="warning-banner">
          Supabase is not connected, so anything added here is kept in the API's memory and
          disappears when it restarts. Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
          <code> .env</code> to store questions for real.
        </p>
      )}

      {!writtenMarking && questions.some((question) => question.type === "open-ended") && (
        <p className="warning-banner">
          AI marking is not set up, so written (open-ended) questions are kept out of tests until it
          is. Add ANTHROPIC_API_KEY to <code>.env</code> and restart the API to switch it on.
        </p>
      )}

      {usingDefaultPassword && (
        <p className="warning-banner">
          The admin password is still the built-in default. Set <code>ADMIN_PASSWORD</code> in
          <code> .env</code> before this is reachable by anyone else.
        </p>
      )}

      <nav className="tab-row">
        <button
          type="button"
          className={`tab ${tab === "add" ? "selected" : ""}`}
          onClick={() => switchTab("add")}
        >
          {editing ? "Edit question" : "Add question"}
        </button>
        <button
          type="button"
          className={`tab ${tab === "list" ? "selected" : ""}`}
          onClick={() => switchTab("list")}
        >
          All questions
        </button>
        <button
          type="button"
          className={`tab ${tab === "import" ? "selected" : ""}`}
          onClick={() => switchTab("import")}
        >
          Bulk import
        </button>
      </nav>

      {/* On the form's tab both sit beside its button instead: see below. */}
      {tab !== "add" && notice && <p className="success-banner">{notice}</p>}
      {tab !== "add" && error && <p className="error-banner">{error}</p>}

      {tab === "add" && (
        <section className="panel">
          <h2>{editing ? "Edit question" : "Add a question"}</h2>
          <QuestionForm
            // One form per question being edited, and a new one after each add.
            key={editing ? `edit-${editing.id}` : `new-${formKey}`}
            initial={editing}
            carryOver={carryOver}
            onSubmit={handleSave}
            onCancel={editing ? () => setEditing(null) : undefined}
            submitting={saving}
            error={error}
          />
          {notice && (
            <p className="success-banner" role="status" ref={noticeRef}>
              {notice}
            </p>
          )}
        </section>
      )}

      {tab === "list" && (
        <section className="panel">
          <div className="filter-row">
            <label>
              Subject
              <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
                <option value="">All subjects</option>
                <option value="math">Mathematics</option>
                <option value="english">English</option>
                <option value="russian">Russian</option>
              </select>
            </label>

            <label>
              Search
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find text in a question"
              />
            </label>
          </div>

          {questions.length === 0 ? (
            <p className="empty-note">
              No questions yet. Add one above, or paste a spreadsheet export into bulk import.
            </p>
          ) : (
            <ul className="question-list">
              {questions.map((question) => (
                <li key={question.id} className="question-row">
                  <div className="question-row-main">
                    {question.status !== "ready" && (
                      <p className={`question-status question-status-${question.status}`}>
                        {statusLabel[question.status]}
                      </p>
                    )}
                    <p className="question-row-prompt">{question.prompt}</p>
                    <p className="question-row-meta">
                      {subjectName(question.subjectId)} - {topicName(question.subjectId, question.topicId)}{" "}
                      - {question.difficulty} - {question.type}
                      {question.paperYear ? ` - ${question.paperYear}` : ""}
                      {question.subtopic ? ` - ${question.subtopic}` : ""}
                    </p>
                    <p className="question-row-answer">Answer: {question.correctAnswer || "not entered yet"}</p>
                    {followsSiteLanguage(question.subjectId) && (
                      <p className="question-row-translations">
                        {t("translations.listLabel")}:{" "}
                        {siteLanguages.filter((language) => question.translations?.[language]).map((language) => (
                          <span key={language} className="translation-chip">
                            {language.toUpperCase()}
                          </span>
                        ))}
                        {!siteLanguages.some((language) => question.translations?.[language]) && (
                          <span className="translation-none">{t("translations.listNone")}</span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="question-row-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {
                        // What the list last said does not apply to the form.
                        setNotice(null);
                        setError(null);
                        setEditing(question);
                        setTab("add");
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => void handleDelete(question)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "import" && (
        <section className="panel">
          <h2>Bulk import from a spreadsheet</h2>
          <p className="panel-hint">
            In Google Sheets choose File, Download, Comma-separated values, then open the file and
            paste everything below. Keep the header row. The header must include at least subject,
            topic, question and correct_answer.
          </p>

          <p className="panel-hint">
            Full column list: <code>{CSV_TEMPLATE}</code>
          </p>

          <p className="panel-hint">
            correct_answer can be the letter (A, B, C, D, E) or the full answer text. Leave the option
            columns empty for short-answer questions. For a written answer marked by the AI marker,
            set type to <code>open-ended</code> and put the marking guide in correct_answer.
          </p>

          <p className="panel-hint">
            marks is what the paper says the question is worth, between {markLimits.min} and{" "}
            {markLimits.max}. Leave it blank and the question counts for one.
          </p>

          <p className="panel-hint">{t("import.translationHint")}</p>

          {/* A file dropped here fills the box below; nothing is imported until the button is pressed. */}
          <div
            className={`drop-zone${dragging ? " dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              // Moving over the zone's own children fires this too.
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void loadSheet(event.dataTransfer.files);
            }}
          >
            <strong>{dragging ? t("import.dropActive") : t("import.dropTitle")}</strong>
            <label className="drop-zone-pick">
              {t("import.dropOr")} {t("import.choose")}
              <input
                type="file"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                onChange={(event) => {
                  void loadSheet(event.target.files);
                  // So choosing the same file again, after editing it, loads it again.
                  event.target.value = "";
                }}
              />
            </label>
          </div>

          {sheetNote && (
            <p className={sheetNote.kind === "success" ? "success-banner" : "error-banner"}>{sheetNote.text}</p>
          )}

          <label>
            CSV rows
            <textarea
              rows={10}
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              placeholder={CSV_TEMPLATE}
              spellCheck={false}
            />
          </label>

          <button
            type="button"
            className="primary-button"
            onClick={() => void handleImport()}
            disabled={importing || csv.trim().length === 0}
          >
            {importing ? "Importing..." : "Import questions"}
          </button>

          {importResult && (
            <div className="import-result">
              <p className={importResult.importedCount > 0 ? "success-banner" : "warning-banner"}>
                Imported {importResult.importedCount} question
                {importResult.importedCount === 1 ? "" : "s"}
                {importResult.skippedCount > 0 ? `, skipped ${importResult.skippedCount}` : ""}.
              </p>

              {importResult.errors.length > 0 && (
                <ul className="import-errors">
                  {importResult.errors.map((issue) => (
                    <li key={`${issue.row}-${issue.message}`}>
                      <strong>Row {issue.row}:</strong> {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
