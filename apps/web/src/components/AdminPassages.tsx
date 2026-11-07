import { useState } from "react";
import type { Passage, PassageDraft } from "@grade9/shared";
import { paperYearLimits, passageLimits, subjectName, subjects } from "@grade9/shared";
import { createPassage, deletePassage, updatePassage } from "../services/passagesApi";
import { ApiError } from "../services/apiClient";

/**
 * The Passages tab: the reading texts that several questions are about.
 *
 * A passage is typed or pasted here once, then chosen on each of its questions
 * in the question form (or linked by its id in a spreadsheet import). Students
 * see it beside those questions, which come one after another in a test.
 */
export function AdminPassages({
  initialEditing = null,
  passages,
  questionCounts,
  onChanged,
  onSessionEnded,
  onShowQuestions
}: {
  /** A passage to open in the form straight away (Edit passage on the question list). */
  initialEditing?: Passage | null;
  passages: Passage[];
  questionCounts: Record<string, number>;
  /** Called after a save or delete, so the page reads the passages again. */
  onChanged: () => Promise<void>;
  onSessionEnded: () => void;
  /** Shows the question list narrowed to one passage's questions. */
  onShowQuestions: (passage: Passage) => void;
}) {
  const [editing, setEditing] = useState<Passage | "new" | null>(initialEditing);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = passages.filter((passage) => !subjectFilter || passage.subjectId === subjectFilter);

  function failed(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 401) {
      onSessionEnded();
      return;
    }
    setError((cause as Error).message);
  }

  async function remove(passage: Passage) {
    const count = questionCounts[passage.id] ?? 0;
    const warning =
      count > 0
        ? `\n\n${count} question${count === 1 ? " is" : "s are"} about it. They stay in the bank, with no passage.`
        : "";
    if (!window.confirm(`Delete the passage "${passage.title}"?${warning}`)) return;

    setError(null);
    try {
      await deletePassage(passage.id);
      setNotice(`Deleted "${passage.title}".`);
      if (editing !== "new" && editing?.id === passage.id) setEditing(null);
      await onChanged();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        setNotice("That passage had already been deleted.");
        await onChanged();
        return;
      }
      failed(cause);
    }
  }

  return (
    <div className="passages-panel">
      <div className="admin-toolbar">
        <label className="toolbar-field">
          Subject
          <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
            <option value="">All subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
        <p className="toolbar-count">
          {shown.length} passage{shown.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setEditing("new");
            setNotice(null);
            setError(null);
          }}
        >
          Add a passage
        </button>
      </div>

      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}

      {editing && (
        <PassageForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          defaultSubject={subjectFilter || "azerbaijani"}
          onCancel={() => setEditing(null)}
          onSaved={async (saved, wasNew) => {
            setEditing(null);
            setNotice(wasNew ? `Added "${saved.title}". Choose it on its questions in the question form.` : `Saved "${saved.title}".`);
            await onChanged();
          }}
          onFailed={failed}
        />
      )}

      {shown.length === 0 ? (
        <p className="empty-note">
          No passages yet. Add the text of a reading task here once, then choose it on each of its questions.
        </p>
      ) : (
        <ul className="passage-list">
          {shown.map((passage) => {
            const count = questionCounts[passage.id] ?? 0;
            return (
              <li key={passage.id} className="passage-card">
                <div className="passage-card-main">
                  <p className="admin-chips">
                    <span className="admin-chip subject-chip" data-subject={passage.subjectId}>
                      {subjectName(passage.subjectId)}
                    </span>
                    {passage.paperYear && <span className="admin-chip">{passage.paperYear}</span>}
                    {passage.source && <span className="admin-chip">{passage.source}</span>}
                  </p>
                  <h3 className="passage-card-title">{passage.title}</h3>
                  <p className="passage-card-body">{passage.body}</p>
                </div>
                <div className="passage-card-side">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onShowQuestions(passage)}
                    disabled={count === 0}
                  >
                    {count === 0 ? "No questions yet" : `${count} question${count === 1 ? "" : "s"}`}
                  </button>
                  <div className="row-actions">
                    <button type="button" className="ghost-button" onClick={() => setEditing(passage)}>
                      Edit
                    </button>
                    <button type="button" className="danger-button" onClick={() => void remove(passage)}>
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PassageForm({
  initial,
  defaultSubject,
  onCancel,
  onSaved,
  onFailed
}: {
  initial: Passage | null;
  defaultSubject: string;
  onCancel: () => void;
  onSaved: (passage: Passage, wasNew: boolean) => Promise<void>;
  onFailed: (cause: unknown) => void;
}) {
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? defaultSubject);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [paperYear, setPaperYear] = useState(initial?.paperYear ? String(initial.paperYear) : "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!title.trim()) return setProblem("Give the passage a title, as the paper names it.");
    if (!body.trim()) return setProblem("Type or paste the text.");

    const year = Number.parseInt(paperYear, 10);
    const draft: PassageDraft = {
      subjectId,
      title: title.trim(),
      body: body.trim(),
      paperYear: Number.isFinite(year) ? year : null,
      source: source.trim() || null
    };

    setSaving(true);
    setProblem(null);
    try {
      const { passage } = initial ? await updatePassage(initial.id, draft) : await createPassage(draft);
      await onSaved(passage, initial === null);
    } catch (cause) {
      onFailed(cause);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel passage-form" onSubmit={submit}>
      <h3>{initial ? "Edit passage" : "Add a passage"}</h3>
      <div className="form-row">
        <label>
          Subject
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Title
          <input
            type="text"
            value={title}
            maxLength={passageLimits.titleMax}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Bir xatirə"
          />
        </label>
      </div>
      <label>
        Text
        <textarea
          rows={12}
          value={body}
          maxLength={passageLimits.bodyMax}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Paste the text as printed. Leave a blank line between paragraphs."
        />
        <span className="field-hint">
          {body.length.toLocaleString()} / {passageLimits.bodyMax.toLocaleString()} characters. A blank line starts a new
          paragraph.
        </span>
      </label>
      <div className="form-row">
        <label>
          Paper year
          <input
            type="number"
            min={paperYearLimits.min}
            max={paperYearLimits.max}
            value={paperYear}
            onChange={(event) => setPaperYear(event.target.value)}
            placeholder="e.g. 2026"
          />
        </label>
        <label className="grow">
          Source
          <input
            type="text"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="e.g. DİM 05.04.2026, Variant C"
          />
        </label>
      </div>
      {problem && (
        <p className="error-banner" role="alert">
          {problem}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? "Saving..." : initial ? "Save changes" : "Add passage"}
        </button>
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
