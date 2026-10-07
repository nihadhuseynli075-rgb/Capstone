import { useCallback, useEffect, useRef, useState } from "react";
import type { BankQuestion, QuestionDraft, QuestionStatus } from "@grade9/shared";
import {
  difficultyNames,
  followsSiteLanguage,
  markLimits,
  questionTypeNames,
  siteLanguages,
  subjectName,
  topicName
} from "@grade9/shared";
import { QuestionForm, type QuestionCarryOver } from "../components/QuestionForm";
import { adminText } from "../components/adminText";
import { fill } from "../features/friends/fill";
import { ApiError } from "../services/apiClient";
import {
  adminLogin,
  adminLogout,
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

/** The dashboard's tabs, in the order they are shown and stepped through. */
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "add", label: "Add question" },
  { id: "list", label: "All questions" },
  { id: "import", label: "Bulk import" }
];

/**
 * The most a dropped sheet may be. A question sheet is a few hundred kilobytes
 * at the very most, so a file this size is the wrong file, and reading it into
 * the box would freeze the page for nothing.
 */
const MAX_SHEET_BYTES = 2 * 1024 * 1024;

/**
 * Why a question is not in tests yet. Saving a draft complete through the form
 * makes it ready; a question waiting for its picture needs the picture too.
 */
const statusLabel: Record<Exclude<QuestionStatus, "ready">, string> = {
  draft: "Draft - not in tests until its options and answer are added",
  "image-pending": "Image coming soon - not in tests until its picture is added"
};

/**
 * Why the sign-in form is back: the session ended (the API restarted, or its
 * twelve hours ran out), with or without a question waiting to be saved.
 */
type SignInReason = "session-ended" | "session-ended-with-draft" | null;

function LoginScreen({
  reason,
  onSignedIn
}: {
  reason: SignInReason;
  onSignedIn: (storageMode: string, isDefault: boolean) => void;
}) {
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

      {/* Without this the form simply came back, and a question typed before
          the session ended looked as if it had been saved. */}
      {reason && (
        <p className="warning-banner" role="status">
          {reason === "session-ended-with-draft" ? adminText.sessionEndedDraft : adminText.sessionEnded}
        </p>
      )}

      <form className="panel" onSubmit={handleSubmit}>
        <label>
          Admin password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            autoComplete="current-password"
            // Tied to the refusal below, so returning to the field says why.
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "admin-login-error" : undefined}
          />
        </label>

        {/* An alert: a wrong password was only painted, and a screen reader
            heard nothing after pressing Enter. */}
        {error && (
          <p className="error-banner" role="alert" id="admin-login-error">
            {error}
          </p>
        )}

        <button type="submit" className="primary-button" disabled={busy || password.length === 0}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export function AdminPage() {
  const [token, setToken] = useState<string | null>(() => getAdminToken());
  const [tab, setTab] = useState<Tab>("add");

  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  // The whole bank, which the list's filters do not change.
  const [bank, setBank] = useState<{ total: number; written: number } | null>(null);
  const [storageMode, setStorageMode] = useState<string>("");
  const [writtenMarking, setWrittenMarking] = useState(true);
  const [usingDefaultPassword, setUsingDefaultPassword] = useState(false);

  const [subjectFilter, setSubjectFilter] = useState("");
  // What is typed, and what has actually been asked for. Kept apart so the
  // bank is not queried once per keystroke.
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [editing, setEditing] = useState<BankQuestion | null>(null);

  // Set when the API stops recognising this tab's session part way through.
  // The dashboard then stays mounted, hidden behind the sign-in form, so what
  // is typed into the question form survives signing in again.
  const [sessionEnded, setSessionEnded] = useState(false);
  // A question whose save was refused because the session had ended. It is
  // sent again as soon as the admin has signed back in.
  const pendingSave = useRef<QuestionDraft | null>(null);
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

  // Where the list was scrolled to when Edit was pressed, to go back to.
  const listScrollRef = useRef(0);
  const formPanelRef = useRef<HTMLElement>(null);
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

  /** Left and Right step through the tabs (wrapping), Home and End jump to the ends. */
  function handleTabKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((item) => item.id === tab);
    const moves: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1
    };
    const nextIndex = moves[event.key];
    if (nextIndex === undefined) return;

    event.preventDefault();
    const next = TABS[nextIndex].id;
    switchTab(next);
    window.requestAnimationFrame(() => document.getElementById(`admin-tab-${next}`)?.focus());
  }

  /** Any 401 means the API restarted or the session expired: show login again, and say why. */
  const handleFailure = useCallback((cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) {
      setAdminToken(null);
      setToken(null);
      setSessionEnded(true);
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
      setBank(data.bank ?? null);
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
    // Trimmed as the API trims it, so a box holding only spaces is no filter
    // rather than one announcing "Matching this filter".
    const timer = window.setTimeout(() => setSearchQuery(search.trim()), 300);
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

  // The toast on the list tab has done its job after a few seconds.
  useEffect(() => {
    if (!notice || tab === "add") return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice, tab]);

  /*
   * Deleting a question takes its row, and the Delete button that had focus,
   * off the page; importing clears the box and disables Import. Either way
   * focus fell to the body, so a keyboard user started again from the top
   * and a screen reader heard nothing. The message that says what happened
   * takes focus instead, but only when focus has nowhere else to be.
   */
  const listNoticeRef = useRef<HTMLParagraphElement>(null);
  const listErrorRef = useRef<HTMLParagraphElement>(null);
  const importResultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (!lost) return;
    const message = listErrorRef.current ?? importResultRef.current ?? listNoticeRef.current;
    message?.focus();
    // The list too: the deleted row, and its button, go only once the list
    // has been read again after the message is already up.
  }, [notice, error, importResult, questions]);

  /*
   * Editing a question from the list, and coming back to it.
   *
   * Edit used to leave the page where it was, deep in a long list, so the form
   * opened scrolled to its end with the question text far above; and Cancel or
   * Save left an empty "Add a question" form where the list had been. Now the
   * form opens at its top, and either way out goes back to the list, scrolled
   * to the row that was edited.
   */
  function startEditing(question: BankQuestion) {
    listScrollRef.current = window.scrollY;
    // What the list last said does not apply to the form.
    setNotice(null);
    setError(null);
    setEditing(question);
    setTab("add");
    window.requestAnimationFrame(() => formPanelRef.current?.scrollIntoView({ block: "start" }));
  }

  function backToList() {
    setEditing(null);
    setTab("list");
    const position = listScrollRef.current;
    // Two frames: the list is drawn in the first, and only then is it tall
    // enough to scroll back down.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.scrollTo(0, position)));
  }

  /** Signed in, for the first time or again: back to the dashboard, saving anything left waiting. */
  function handleSignedIn(mode: string, isDefault: boolean) {
    setStorageMode(mode);
    setUsingDefaultPassword(isDefault);
    setSessionEnded(false);
    setToken(getAdminToken());

    const draft = pendingSave.current;
    pendingSave.current = null;
    if (draft) void handleSave(draft);
  }

  // Before anything has been shown there is nothing to keep, so the sign-in
  // form is the whole page.
  if (!token && !sessionEnded) {
    return <LoginScreen reason={null} onSignedIn={handleSignedIn} />;
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
        backToList();
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
      // Kept to be sent again once the admin has signed back in, rather than
      // lost with the session.
      if (cause instanceof ApiError && cause.status === 401) pendingSave.current = draft;
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
      // Already deleted somewhere else, another tab or another admin: it is
      // gone either way, which is what was asked for. Saying "Question not
      // found." and leaving the row in the list until a reload helped nobody.
      if (cause instanceof ApiError && cause.status === 404) {
        setNotice("That question had already been deleted. The list has been refreshed.");
        if (editing?.id === question.id) setEditing(null);
        await refresh();
        return;
      }

      handleFailure(cause);
    }
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    setImportResult(null);
    // "Loaded the file, check it, then press Import" has been done once Import
    // is pressed; left up, it sat over the result and then over an empty box.
    setSheetNote(null);

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
      setSheetNote({ kind: "error", text: adminText.importNotSheet });
      return;
    }

    if (file.size === 0) {
      setSheetNote({ kind: "error", text: adminText.importEmpty });
      return;
    }

    if (file.size > MAX_SHEET_BYTES) {
      setSheetNote({ kind: "error", text: adminText.importTooBig });
      return;
    }

    try {
      const text = await file.text();

      if (text.trim().length === 0) {
        setSheetNote({ kind: "error", text: adminText.importEmpty });
        return;
      }

      setCsv(text);
      setSheetNote({
        kind: "success",
        text: `${adminText.importLoaded} ${file.name}. ${adminText.importLoadedHint}${fileCount > 1 ? ` ${adminText.importFirstOnly}` : ""}`
      });
    } catch {
      setSheetNote({ kind: "error", text: adminText.importUnreadable });
    }
  }

  const bankTotal = bank?.total ?? questions.length;
  const filtered = subjectFilter.length > 0 || searchQuery.length > 0;

  return (
    <>
      {!token && (
        <LoginScreen
          reason={pendingSave.current ? "session-ended-with-draft" : "session-ended"}
          onSignedIn={handleSignedIn}
        />
      )}

      {/* Hidden rather than unmounted while signed out: see sessionEnded. */}
      <div className="stack" style={token ? undefined : { display: "none" }}>
        <section className="admin-head">
          <div>
            <h1>Admin dashboard</h1>
            <p className="lede">
              {tab === "list" && filtered
                ? fill(adminText.bankMatching, { total: String(bankTotal), count: String(questions.length) })
                : fill(adminText.bankCount, { total: String(bankTotal) })}
            </p>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={async () => {
              try {
                await adminLogout();
              } catch {
                // An API that is down or has restarted has no session left to
                // end. This tab forgets the token either way.
              }
              pendingSave.current = null;
              setSessionEnded(false);
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
            disappears when it restarts. Fill in SUPABASE_URL and SUPABASE_SECRET_KEY in
            <code> .env</code> to store questions for real.
          </p>
        )}

        {/* About the bank, not the list on screen, which may be filtered. */}
        {!writtenMarking && (bank ? bank.written > 0 : questions.some((question) => question.type === "open-ended")) && (
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

        {/*
          * Real tabs, not three buttons told apart only by a class: a screen
          * reader hears "tab, 2 of 3, selected". As the tabs pattern expects,
          * Tab reaches only the selected one and the arrow keys move between
          * them (see handleTabKey).
          */}
        <div className="tab-row" role="tablist" aria-label="Admin sections" onKeyDown={handleTabKey}>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`admin-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`admin-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              className={`tab ${tab === item.id ? "selected" : ""}`}
              onClick={() => switchTab(item.id)}
            >
              {item.id === "add" && editing ? "Edit question" : item.label}
            </button>
          ))}
        </div>

        {/* On the form's tab both sit beside its button instead: see below. */}
        {/* Fixed to the viewport: after Save the list is scrolled to the edited
            row, thousands of pixels below a banner placed at the top. A status
            and an alert, so they are read out, and focusable by script: see
            the effect that hands them focus. */}
        {tab !== "add" && notice && (
          <p className="success-banner admin-toast" role="status" ref={listNoticeRef} tabIndex={-1}>
            {notice}
          </p>
        )}
        {tab !== "add" && error && (
          <p className="error-banner" role="alert" ref={listErrorRef} tabIndex={-1}>
            {error}
          </p>
        )}

        {tab === "add" && (
          <section
            className="panel"
            ref={formPanelRef}
            role="tabpanel"
            id="admin-panel-add"
            aria-labelledby="admin-tab-add"
          >
            <h2>{editing ? "Edit question" : "Add a question"}</h2>
            {/* Saving does not change this on its own: a question waiting for
                its picture stays out of tests until one is uploaded below. */}
            {editing && editing.status !== "ready" && (
              <p className={`question-status question-status-${editing.status}`}>{statusLabel[editing.status]}</p>
            )}
            <QuestionForm
              // One form per question being edited, and a new one after each add.
              key={editing ? `edit-${editing.id}` : `new-${formKey}`}
              initial={editing}
              carryOver={carryOver}
              onSubmit={handleSave}
              onCancel={editing ? backToList : undefined}
              submitting={saving}
              error={error}
              // The "added" notice is about the last question, not the one now
              // being typed or rejected.
              onEdited={() => setNotice(null)}
            />
            {notice && (
              <p className="success-banner" role="status" ref={noticeRef}>
                {notice}
              </p>
            )}
          </section>
        )}

        {tab === "list" && (
          <section className="panel" role="tabpanel" id="admin-panel-list" aria-labelledby="admin-tab-list">
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
                {filtered
                  ? adminText.noMatch
                  : "No questions yet. Add one above, or paste a spreadsheet export into bulk import."}
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
                        - {difficultyNames[question.difficulty]} - {questionTypeNames[question.type]}
                        {question.paperYear ? ` - ${question.paperYear}` : ""}
                        {question.subtopic ? ` - ${question.subtopic}` : ""}
                      </p>
                      <p className="question-row-answer">Answer: {question.correctAnswer || "not entered yet"}</p>
                      {followsSiteLanguage(question.subjectId) && (
                        <p className="question-row-translations">
                          {adminText.translationsListLabel}:{" "}
                          {siteLanguages.filter((language) => question.translations?.[language]).map((language) => (
                            <span key={language} className="translation-chip">
                              {language.toUpperCase()}
                            </span>
                          ))}
                          {!siteLanguages.some((language) => question.translations?.[language]) && (
                            <span className="translation-none">{adminText.translationsListNone}</span>
                          )}
                        </p>
                      )}
                    </div>

                    <div className="question-row-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => startEditing(question)}
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
          <section className="panel" role="tabpanel" id="admin-panel-import" aria-labelledby="admin-tab-import">
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

            <p className="panel-hint">{adminText.importTranslationHint}</p>

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
              <strong>{dragging ? adminText.importDropActive : adminText.importDropTitle}</strong>
              <label className="drop-zone-pick">
                {adminText.importDropOr} {adminText.importChoose}
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
              // Read out like the other messages: a file that loaded, or one that could not be.
              <p
                className={sheetNote.kind === "success" ? "success-banner" : "error-banner"}
                role={sheetNote.kind === "success" ? "status" : "alert"}
              >
                {sheetNote.text}
              </p>
            )}

            <label>
              CSV rows
              <textarea
                rows={10}
                value={csv}
                onChange={(event) => {
                  setCsv(event.target.value);
                  // Typing or pasting over a loaded file means the note about that file no longer applies.
                  setSheetNote(null);
                }}
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

            {/* Read out as a status, and focusable by script so it can take the
                focus the disabled Import button lets go of. */}
            {importResult && (
              <div className="import-result" role="status" ref={importResultRef} tabIndex={-1}>
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
    </>
  );
}
