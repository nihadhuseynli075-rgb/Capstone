import { useMemo, useState } from "react";
import type { BankQuestion, Passage, QuestionStatus, QuestionType } from "@grade9/shared";
import {
  decodeAnswerSet,
  difficultyNames,
  followsSiteLanguage,
  questionTypeNames,
  questionTypes,
  siteLanguages,
  subjectName,
  subjects,
  topicName
} from "@grade9/shared";

/**
 * The admin dashboard's "All questions" list, redesigned 7 Nov 2026.
 *
 * The old list was one long column of rows that all looked alike, with the
 * status in a sentence, so finding the drafts, a paper's reading questions or
 * a question entered twice meant reading every row (Nihad, 7 Nov 2026). Now:
 *
 * - a toolbar to narrow it by subject, status, answer type and passage, with
 *   the counts per status as buttons that do the same;
 * - each passage's questions together under the passage's title, in their
 *   order, the way a test serves them;
 * - each row as a card: chips for what it is, the question in a few lines, the
 *   options with the right ones marked, and its picture as a thumbnail;
 * - a flag on questions whose text another question in the subject has too.
 *
 * Subject and search are asked of the API, as before; the rest is narrowed
 * here, since the list already holds every question they apply to.
 */

type StatusFilter = "" | QuestionStatus;

const statusNames: Record<QuestionStatus, string> = {
  ready: "Ready",
  draft: "Draft",
  "image-pending": "Needs picture"
};

/** What a status means for a student, said on the row. */
const statusHints: Record<Exclude<QuestionStatus, "ready">, string> = {
  draft: "Not in tests. Open with Edit, check it, and Save changes to put it in tests.",
  "image-pending": "Not in tests until its picture is added."
};

/**
 * What two questions are compared by: the question, its options and its
 * passage, case and spacing set aside. The papers reuse a question's wording
 * ("Mətnə əsasən...") with another text or other options, which is not a copy.
 */
function sameTextKey(question: BankQuestion): string {
  const tidy = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
  return [question.subjectId, question.passageId ?? "", tidy(question.prompt), ...question.options.map(tidy)].join("|");
}

/** Each question once: the list keys rows by id, and a repeated id drew two rows React could not keep apart. */
function uniqueById(questions: BankQuestion[]): BankQuestion[] {
  const seen = new Set<string>();
  return questions.filter((question) => !seen.has(question.id) && Boolean(seen.add(question.id)));
}

type Unit = { kind: "single"; question: BankQuestion } | { kind: "passage"; passageId: string; questions: BankQuestion[] };

export function AdminQuestionList({
  questions: listed,
  passages,
  editingId,
  subjectFilter,
  onSubjectFilter,
  search,
  onSearch,
  passageFilter,
  onPassageFilter,
  onEdit,
  onDelete,
  onEditPassage,
  emptyText
}: {
  questions: BankQuestion[];
  passages: Passage[];
  editingId: string | null;
  subjectFilter: string;
  onSubjectFilter: (subjectId: string) => void;
  search: string;
  onSearch: (text: string) => void;
  passageFilter: string;
  onPassageFilter: (passageId: string) => void;
  onEdit: (question: BankQuestion) => void;
  onDelete: (question: BankQuestion) => void;
  onEditPassage: (passage: Passage) => void;
  emptyText: string;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [typeFilter, setTypeFilter] = useState<"" | QuestionType>("");
  const [grouped, setGrouped] = useState(true);

  const questions = useMemo(() => uniqueById(listed), [listed]);
  const passageById = useMemo(() => new Map(passages.map((passage) => [passage.id, passage])), [passages]);

  // Questions whose text another question in the same subject has too.
  const repeated = useMemo(() => {
    const counts = new Map<string, number>();
    for (const question of questions) counts.set(sameTextKey(question), (counts.get(sameTextKey(question)) ?? 0) + 1);
    return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
  }, [questions]);

  // Narrowed by everything but status, so the status counts say what each
  // status button would show.
  const beforeStatus = questions.filter(
    (question) =>
      (!typeFilter || question.type === typeFilter) &&
      (!passageFilter || (passageFilter === "none" ? question.passageId === null : question.passageId === passageFilter))
  );
  const statusCounts: Record<QuestionStatus, number> = { ready: 0, draft: 0, "image-pending": 0 };
  for (const question of beforeStatus) statusCounts[question.status] += 1;

  const shown = beforeStatus.filter((question) => !statusFilter || question.status === statusFilter);
  const repeatsShown = shown.filter((question) => repeated.has(sameTextKey(question))).length;

  // Each passage's questions together, where the first of them comes in the
  // list, and in the passage's own order.
  const units: Unit[] = useMemo(() => {
    if (!grouped) return shown.map((question) => ({ kind: "single", question }));
    const result: Unit[] = [];
    const groups = new Map<string, BankQuestion[]>();
    for (const question of shown) {
      if (!question.passageId) {
        result.push({ kind: "single", question });
        continue;
      }
      const group = groups.get(question.passageId);
      if (group) {
        group.push(question);
      } else {
        const fresh = [question];
        groups.set(question.passageId, fresh);
        result.push({ kind: "passage", passageId: question.passageId, questions: fresh });
      }
    }
    const order = (question: BankQuestion) => question.passageOrder ?? Number.MAX_SAFE_INTEGER;
    for (const group of groups.values()) group.sort((a, b) => order(a) - order(b));
    return result;
  }, [shown, grouped]);

  const subjectPassages = passages.filter((passage) => !subjectFilter || passage.subjectId === subjectFilter);

  return (
    <div className="admin-questions">
      <div className="admin-toolbar">
        <label className="toolbar-field toolbar-search">
          Search
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Find text in a question"
          />
        </label>

        <label className="toolbar-field">
          Subject
          <select value={subjectFilter} onChange={(event) => onSubjectFilter(event.target.value)}>
            <option value="">All subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>

        <label className="toolbar-field">
          Answer type
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "" | QuestionType)}>
            <option value="">All types</option>
            {questionTypes.map((type) => (
              <option key={type} value={type}>
                {questionTypeNames[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="toolbar-field">
          Passage
          <select value={passageFilter} onChange={(event) => onPassageFilter(event.target.value)}>
            <option value="">Any</option>
            <option value="none">No passage</option>
            {subjectPassages.map((passage) => (
              <option key={passage.id} value={passage.id}>
                {passage.title}
              </option>
            ))}
          </select>
        </label>

        <label className="toolbar-toggle">
          <input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} />
          Group by passage
        </label>
      </div>

      {/* The counts are the status filter: pressing one shows only those. */}
      <div className="status-filter" role="group" aria-label="Show questions by status">
        <button
          type="button"
          className={`status-pill${statusFilter === "" ? " selected" : ""}`}
          aria-pressed={statusFilter === ""}
          onClick={() => setStatusFilter("")}
        >
          All <span className="status-pill-count">{beforeStatus.length}</span>
        </button>
        {(Object.keys(statusNames) as QuestionStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            className={`status-pill${statusFilter === status ? " selected" : ""}`}
            data-status={status}
            aria-pressed={statusFilter === status}
            onClick={() => setStatusFilter(statusFilter === status ? "" : status)}
          >
            {statusNames[status]} <span className="status-pill-count">{statusCounts[status]}</span>
          </button>
        ))}
        {repeatsShown > 0 && (
          <p className="repeat-note">
            {repeatsShown} question{repeatsShown === 1 ? " has" : "s have"} the same text as another. Check for copies.
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="empty-note">{questions.length === 0 ? emptyText : "No question matches these filters."}</p>
      ) : (
        <ul className="admin-question-list">
          {units.map((unit) =>
            unit.kind === "single" ? (
              <QuestionCard
                key={unit.question.id}
                question={unit.question}
                passage={unit.question.passageId ? passageById.get(unit.question.passageId) ?? null : null}
                editing={editingId === unit.question.id}
                repeated={repeated.has(sameTextKey(unit.question))}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ) : (
              <li key={`passage-${unit.passageId}`} className="passage-group">
                <PassageGroupHead
                  passage={passageById.get(unit.passageId) ?? null}
                  count={unit.questions.length}
                  onEditPassage={onEditPassage}
                />
                <ol className="passage-group-list">
                  {unit.questions.map((question) => (
                    <QuestionCard
                      key={question.id}
                      question={question}
                      passage={null}
                      editing={editingId === question.id}
                      repeated={repeated.has(sameTextKey(question))}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}
                </ol>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

function PassageGroupHead({
  passage,
  count,
  onEditPassage
}: {
  passage: Passage | null;
  count: number;
  onEditPassage: (passage: Passage) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="passage-group-head">
      <div>
        <p className="passage-group-kicker">
          Passage · {count} question{count === 1 ? "" : "s"}
        </p>
        <h3 className="passage-group-title">{passage?.title ?? "A passage that has been deleted"}</h3>
        {passage && open && <p className="passage-group-body">{passage.body}</p>}
      </div>
      {passage && (
        <div className="row-actions">
          <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Hide text" : "Show text"}
          </button>
          <button type="button" className="ghost-button" onClick={() => onEditPassage(passage)}>
            Edit passage
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  passage,
  editing,
  repeated,
  onEdit,
  onDelete
}: {
  question: BankQuestion;
  passage: Passage | null;
  editing: boolean;
  repeated: boolean;
  onEdit: (question: BankQuestion) => void;
  onDelete: (question: BankQuestion) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const choice = question.type === "multiple-choice" || question.type === "multiple-select";
  const right = question.type === "multiple-select" ? decodeAnswerSet(question.correctAnswer) : [question.correctAnswer];
  const translated = siteLanguages.filter((language) => question.translations?.[language]);
  const long = question.prompt.length > 220 || question.prompt.split("\n").length > 3;

  return (
    <li className={`admin-question${editing ? " is-editing" : ""}`} data-status={question.status}>
      <div className="admin-question-body">
        <p className="admin-chips">
          {question.status !== "ready" && (
            <span className="admin-chip status-chip" data-status={question.status} title={statusHints[question.status]}>
              {statusNames[question.status]}
            </span>
          )}
          {editing && <span className="admin-chip editing-chip">Open in the form</span>}
          {repeated && (
            <span className="admin-chip repeat-chip" title="Another question in this subject has the same text.">
              Same text as another
            </span>
          )}
          <span className="admin-chip subject-chip" data-subject={question.subjectId}>
            {subjectName(question.subjectId)}
          </span>
          <span className="admin-chip">{topicName(question.subjectId, question.topicId)}</span>
          <span className="level-tag" data-level={question.difficulty}>
            {difficultyNames[question.difficulty]}
          </span>
          <span className="admin-chip">{questionTypeNames[question.type]}</span>
          <span className="admin-chip">
            {question.marks} mark{question.marks === 1 ? "" : "s"}
          </span>
          {question.paperYear && <span className="admin-chip">{question.paperYear}</span>}
          {question.passageId && passage && <span className="admin-chip passage-chip">Passage: {passage.title}</span>}
          {question.passageId && question.passageOrder !== null && !passage && (
            <span className="admin-chip">#{question.passageOrder}</span>
          )}
        </p>

        <p className={`admin-question-prompt${long && !expanded ? " clamped" : ""}`}>{question.prompt}</p>
        {long && (
          <button type="button" className="link-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? "Show less" : "Show all"}
          </button>
        )}

        {choice && question.options.length > 0 ? (
          <ol className="admin-options">
            {question.options.map((option, index) => (
              <li key={index} className={right.includes(option) ? "is-right" : undefined}>
                <span className="admin-option-letter">{String.fromCharCode(65 + index)}</span>
                <span>{option}</span>
                {right.includes(option) && <span className="visually-hidden"> (right answer)</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="admin-question-answer">
            <span>{question.type === "open-ended" ? "Marking guide" : "Answer"}:</span>{" "}
            {question.correctAnswer || <em>not entered yet</em>}
          </p>
        )}

        {question.status !== "ready" && <p className="admin-question-hint">{statusHints[question.status]}</p>}

        {followsSiteLanguage(question.subjectId) && (
          <p className="admin-translations">
            Translations:{" "}
            {translated.length === 0 ? (
              <span className="translation-none">none yet</span>
            ) : (
              translated.map((language) => (
                <span key={language} className="translation-chip">
                  {language.toUpperCase()}
                </span>
              ))
            )}
          </p>
        )}
      </div>

      {question.imageUrl && (
        <img className="admin-question-thumb" src={question.imageUrl} alt="" loading="lazy" />
      )}

      <div className="row-actions admin-question-actions">
        <button type="button" className="ghost-button" onClick={() => onEdit(question)}>
          {editing ? "Continue editing" : "Edit"}
        </button>
        <button type="button" className="danger-button" onClick={() => onDelete(question)}>
          Delete
        </button>
      </div>
    </li>
  );
}
