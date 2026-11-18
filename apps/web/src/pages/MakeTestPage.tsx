import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  Difficulty,
  ExamQuestion,
  OwnQuestion,
  StudentQuestionType,
  StudentTestDraft,
  StudentTestItem,
  TestVisibility
} from "@grade9/shared";
import { encodeAnswerSet, repeatedOption, studentTestLimits } from "@grade9/shared";
import { navigate, useRouteParam } from "../app/router";
import { MathText } from "../components/MathText";
import { useAuth } from "../features/auth/AuthContext";
import { signInRoute } from "../features/auth/returnPath";
import { fill } from "../features/friends/fill";
import { StudentTestErrorBanner } from "../features/studentTests/StudentTestLists";
import { useLanguage, type TranslationKey } from "../lib/i18n";
import { difficultyLabel, subjectLabel, topicLabel } from "../lib/testText";
import { fetchBankForPicking, fetchMyTests, saveStudentTest, uploadTestPicture } from "../services/studentTestsApi";
import { fetchCatalog, type CatalogSubject } from "../services/testsApi";
import "../styles/friends.css";

/**
 * Making a test (session of 18 Nov 2026): the student writes their own
 * questions, picks some from the bank, or both, and chooses who can take it.
 * Opened with ?id= it edits one of their tests instead.
 *
 * The student's own questions are edited with the right answer kept by the
 * option's place, not its text, so retyping an option never loses which one
 * is right; it becomes text again when the test is saved. Everything the API
 * checks is checked here first, in the site language.
 */

const limits = studentTestLimits;
const LETTERS = "ABCDEF";
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** One of the student's own questions while it is being written. */
interface OwnDraft {
  type: StudentQuestionType;
  prompt: string;
  options: string[];
  /** The right options, by place. One for a single right option. */
  right: number[];
  shortAnswer: string;
  explanation: string;
  imageUrl: string | null;
}

type EditorItem = { key: string; kind: "own"; own: OwnDraft } | { key: string; kind: "bank"; questionId: string };

let nextKey = 0;
const newKey = () => `item-${(nextKey += 1)}`;

function blankOwn(): OwnDraft {
  return { type: "multiple-choice", prompt: "", options: ["", "", "", ""], right: [], shortAnswer: "", explanation: "", imageUrl: null };
}

/** A saved question opened for editing. */
function fromOwn(question: OwnQuestion): OwnDraft {
  const rightTexts =
    question.type === "multiple-select"
      ? (() => {
          try {
            const parsed: unknown = JSON.parse(question.correctAnswer);
            return Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            return [];
          }
        })()
      : [question.correctAnswer];
  return {
    type: question.type,
    prompt: question.prompt,
    options: question.type === "short-answer" ? ["", "", "", ""] : [...question.options],
    right: question.options.flatMap((option, index) => (rightTexts.includes(option) ? [index] : [])),
    shortAnswer: question.type === "short-answer" ? question.correctAnswer : "",
    explanation: question.explanation,
    imageUrl: question.imageUrl
  };
}

/** The question as it is saved. */
function toOwn(draft: OwnDraft): OwnQuestion {
  const options = draft.type === "short-answer" ? [] : draft.options.map((option) => option.trim()).filter(Boolean);
  // The right options by place, among the ones that are filled in.
  const filled = draft.options.map((option) => option.trim());
  const rightTexts = draft.right.map((index) => filled[index]).filter(Boolean);
  const correctAnswer =
    draft.type === "short-answer"
      ? draft.shortAnswer.trim()
      : draft.type === "multiple-choice"
        ? (rightTexts[0] ?? "")
        : encodeAnswerSet(options, rightTexts);
  return {
    kind: "own",
    type: draft.type,
    prompt: draft.prompt.trim(),
    options,
    correctAnswer,
    explanation: draft.explanation.trim(),
    imageUrl: draft.imageUrl
  };
}

/** What is wrong with one own question, in the site language, or null. Mirrors ownQuestionProblem in the API. */
function ownProblem(draft: OwnDraft, number: number, t: (key: TranslationKey) => string): string | null {
  const say = (key: TranslationKey) => fill(t(key), { n: String(number) });
  if (!draft.prompt.trim()) return say("maker.check.prompt");
  if (draft.type === "short-answer") return draft.shortAnswer.trim() ? null : say("maker.check.answer");

  const filled = draft.options.map((option) => option.trim()).filter(Boolean);
  if (filled.length < limits.minOptions) return say("maker.check.options");
  if (repeatedOption(filled) !== null) return say("maker.check.repeated");
  const rightFilled = draft.right.filter((index) => draft.options[index]?.trim());
  if (rightFilled.length === 0) return say("maker.check.right");
  return null;
}

export function MakeTestPage() {
  const { t } = useLanguage();
  const { user, configured } = useAuth();
  const editingId = useRouteParam("id");

  const [catalog, setCatalog] = useState<CatalogSubject[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(!editingId);

  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("math");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [visibility, setVisibility] = useState<TestVisibility>("friends");
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState(20);
  const [items, setItems] = useState<EditorItem[]>([]);
  const [picks, setPicks] = useState<Record<string, ExamQuestion | null>>({});

  const [bankOpen, setBankOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchCatalog()
      .then((subjects) => active && setCatalog(subjects))
      .catch(() => active && setCatalog([]));
    return () => {
      active = false;
    };
  }, []);

  // Editing: the test as it was saved, and the bank questions it picks.
  useEffect(() => {
    if (!user || !editingId) return;
    let active = true;
    setLoaded(false);
    fetchMyTests()
      .then((mine) => {
        if (!active) return;
        const test = mine.tests.find((candidate) => candidate.id === editingId);
        if (!test) {
          setLoadError(Object.assign(new Error("gone"), { gone: true }));
          setLoaded(true);
          return;
        }
        setTitle(test.title);
        setSubjectId(test.subjectId);
        setDifficulty(test.difficulty);
        setVisibility(test.visibility);
        setTimed(test.timeLimitMinutes !== null);
        if (test.timeLimitMinutes !== null) setMinutes(test.timeLimitMinutes);
        setItems(
          test.items.map((item) =>
            item.kind === "own"
              ? { key: newKey(), kind: "own", own: fromOwn(item) }
              : { key: newKey(), kind: "bank", questionId: item.questionId }
          )
        );
        setPicks(mine.picks);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setLoadError(cause);
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [user?.id, editingId]);

  const full = items.length >= limits.maxQuestions;
  const subjects = catalog ?? [];
  const pickedIds = useMemo(
    () => new Set(items.flatMap((item) => (item.kind === "bank" ? [item.questionId] : []))),
    [items]
  );

  if (!user) {
    return (
      <div className="stack">
        <section>
          <h1>{t("maker.titleNew")}</h1>
        </section>
        <section className="panel friends-panel">
          <p className="panel-hint">{configured ? t("maker.signedOut") : t("settings.notConfigured")}</p>
          {configured && (
            <div className="settings-actions">
              <a className="primary-button" href={`#${signInRoute("login", "/make-test")}`}>
                {t("nav.signIn")}
              </a>
            </div>
          )}
        </section>
      </div>
    );
  }

  function update(key: string, change: (own: OwnDraft) => OwnDraft) {
    setItems((current) =>
      current.map((item) => (item.key === key && item.kind === "own" ? { ...item, own: change(item.own) } : item))
    );
  }

  function move(index: number, step: -1 | 1) {
    setItems((current) => {
      const target = index + step;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addPick(question: ExamQuestion) {
    if (full || pickedIds.has(question.id)) return;
    setPicks((current) => ({ ...current, [question.id]: question }));
    setItems((current) => [...current, { key: newKey(), kind: "bank", questionId: question.id }]);
  }

  async function save() {
    setProblem(null);
    setSaveError(null);

    if (!title.trim()) return setProblem(t("maker.check.title"));
    // A pick the bank no longer has is left out rather than saved.
    const kept = items.filter((item) => item.kind === "own" || picks[item.questionId] !== null);
    if (kept.length === 0) return setProblem(t("maker.check.none"));
    for (const [index, item] of kept.entries()) {
      if (item.kind !== "own") continue;
      const found = ownProblem(item.own, index + 1, t);
      if (found) return setProblem(found);
    }

    const draft: StudentTestDraft = {
      title: title.trim(),
      subjectId,
      difficulty,
      visibility,
      timeLimitMinutes: timed ? Math.min(Math.max(1, Math.round(minutes)), limits.maxMinutes) : null,
      items: kept.map((item): StudentTestItem =>
        item.kind === "own" ? toOwn(item.own) : { kind: "bank", questionId: item.questionId }
      )
    };

    setSaving(true);
    try {
      await saveStudentTest(editingId, draft);
      navigate("/friends?tab=mine");
    } catch (cause) {
      setSaveError(cause);
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <p className="panel-hint" role="status">
        {t("mytests.loading")}
      </p>
    );
  }

  if (loadError !== null) {
    return (
      <div className="stack">
        <a className="link-button friend-page-back" href="#/friends?tab=mine">
          ← {t("maker.back")}
        </a>
        {(loadError as { gone?: boolean }).gone ? (
          <p className="error-banner" role="alert">
            {t("mytests.error.gone")}
          </p>
        ) : (
          <StudentTestErrorBanner cause={loadError} />
        )}
      </div>
    );
  }

  return (
    <div className="stack make-test">
      <a className="link-button friend-page-back" href="#/friends?tab=mine">
        ← {t("maker.back")}
      </a>
      <section>
        <h1>{editingId ? t("maker.titleEdit") : t("maker.titleNew")}</h1>
        <p className="lede">{t("maker.lede")}</p>
      </section>

      <section className="panel" aria-labelledby="maker-details-title">
        <h2 id="maker-details-title">{t("maker.detailsTitle")}</h2>
        <div className="maker-fields">
          <label className="maker-field maker-field-wide">
            <span>{t("maker.testTitle")}</span>
            <input
              type="text"
              value={title}
              maxLength={limits.maxTitle}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
          <label className="maker-field">
            <span>{t("maker.subject")}</span>
            <select value={subjectId} onChange={(event) => setSubjectId(event.currentTarget.value)}>
              {(subjects.length ? subjects.map((subject) => subject.id) : ["math", "english", "russian", "azerbaijani"]).map(
                (id) => (
                  <option key={id} value={id}>
                    {subjectLabel(t, id)}
                  </option>
                )
              )}
            </select>
          </label>
          <label className="maker-field">
            <span>{t("maker.difficulty")}</span>
            <select value={difficulty} onChange={(event) => setDifficulty(event.currentTarget.value as Difficulty)}>
              {DIFFICULTIES.map((level) => (
                <option key={level} value={level}>
                  {difficultyLabel(t, level)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="maker-field maker-time">
            <legend>{t("maker.timeLimit")}</legend>
            <label className="maker-inline">
              <input type="checkbox" checked={timed} onChange={(event) => setTimed(event.currentTarget.checked)} />
              <span>{t("maker.timed")}</span>
            </label>
            {timed && (
              <label className="maker-inline">
                <input
                  type="number"
                  min={1}
                  max={limits.maxMinutes}
                  value={minutes}
                  onChange={(event) => setMinutes(Number(event.currentTarget.value))}
                  className="maker-minutes"
                />
                <span>{t("maker.minutes")}</span>
              </label>
            )}
          </fieldset>
        </div>

        <fieldset className="maker-who">
          <legend>{t("maker.whoTitle")}</legend>
          {(["friends", "public"] as TestVisibility[]).map((choice) => (
            <label key={choice} className={`maker-who-option${visibility === choice ? " selected" : ""}`}>
              <input
                type="radio"
                name="visibility"
                checked={visibility === choice}
                onChange={() => setVisibility(choice)}
              />
              <span>
                <strong>{choice === "friends" ? t("maker.friendsOnly") : t("maker.everyone")}</strong>
                <span className="field-hint">{choice === "friends" ? t("maker.friendsOnlyHint") : t("maker.everyoneHint")}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      <section className="panel" aria-labelledby="maker-questions-title">
        <h2 id="maker-questions-title">{t("maker.questionsTitle")}</h2>
        {items.length === 0 && <p className="panel-hint">{t("maker.questionsEmpty")}</p>}

        <ol className="maker-items">
          {items.map((item, index) => (
            <li key={item.key} className="maker-item">
              <div className="maker-item-head">
                <strong>{fill(t("maker.questionN"), { n: String(index + 1) })}</strong>
                {item.kind === "bank" && <span className="maker-tag">{t("maker.fromBank")}</span>}
                <span className="maker-item-tools">
                  <button type="button" className="ghost-button" disabled={index === 0} onClick={() => move(index, -1)}>
                    ↑ <span className="visually-hidden">{t("maker.moveUp")}</span>
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓ <span className="visually-hidden">{t("maker.moveDown")}</span>
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => setItems((current) => current.filter((other) => other.key !== item.key))}
                  >
                    {t("maker.remove")}
                  </button>
                </span>
              </div>

              {item.kind === "bank" ? (
                <BankItemPreview question={picks[item.questionId]} />
              ) : (
                <OwnEditor
                  own={item.own}
                  number={index + 1}
                  onChange={(change) => update(item.key, change)}
                />
              )}
            </li>
          ))}
        </ol>

        {full && <p className="field-hint">{t("maker.limitReached")}</p>}
        <div className="maker-add">
          <button
            type="button"
            className="ghost-button"
            disabled={full}
            onClick={() => setItems((current) => [...current, { key: newKey(), kind: "own", own: blankOwn() }])}
          >
            + {t("maker.writeQuestion")}
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={full}
            aria-expanded={bankOpen}
            onClick={() => setBankOpen((open) => !open)}
          >
            + {t("maker.addFromBank")}
          </button>
        </div>

        {bankOpen && (
          <BankPicker
            subjectId={subjectId}
            catalog={subjects}
            picked={pickedIds}
            full={full}
            onAdd={addPick}
            onClose={() => setBankOpen(false)}
          />
        )}
      </section>

      {problem && (
        <p className="error-banner" role="alert">
          {problem}
        </p>
      )}
      {saveError !== null && <StudentTestErrorBanner cause={saveError} />}

      <div className="maker-save">
        <button type="button" className="primary-button" disabled={saving} onClick={() => void save()}>
          {saving ? t("maker.saving") : t("maker.save")}
        </button>
      </div>
    </div>
  );
}

/** A bank question in the list: its text as it will be shown, or a note that it has left the bank. */
function BankItemPreview({ question }: { question: ExamQuestion | null | undefined }) {
  const { t } = useLanguage();
  if (question === null) return <p className="warning-banner">{t("maker.bankGone")}</p>;
  if (!question) return null;
  return (
    <div className="maker-preview">
      <p className="maker-preview-prompt">
        <MathText text={question.prompt} />
      </p>
      {question.options.length > 0 && (
        <ol className="maker-preview-options" type="A">
          {question.options.map((option, index) => (
            <li key={index}>
              <MathText text={option} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** One of the student's own questions, being written. */
function OwnEditor({
  own,
  number,
  onChange
}: {
  own: OwnDraft;
  number: number;
  onChange: (change: (own: OwnDraft) => OwnDraft) => void;
}) {
  const { t } = useLanguage();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const choice = own.type !== "short-answer";

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const imageUrl = await uploadTestPicture(file);
      onChange((current) => ({ ...current, imageUrl }));
    } catch (cause) {
      setUploadError(cause);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setRight(index: number, on: boolean) {
    onChange((current) => ({
      ...current,
      right:
        current.type === "multiple-choice"
          ? [index]
          : on
            ? [...new Set([...current.right, index])].sort()
            : current.right.filter((other) => other !== index)
    }));
  }

  function removeOption(index: number) {
    onChange((current) => ({
      ...current,
      options: current.options.filter((_, other) => other !== index),
      // Places after the removed option move up by one.
      right: current.right.filter((other) => other !== index).map((other) => (other > index ? other - 1 : other))
    }));
  }

  return (
    <div className="maker-own">
      <label className="maker-field">
        <span>{t("maker.type")}</span>
        <select
          value={own.type}
          onChange={(event) => {
            const type = event.currentTarget.value as StudentQuestionType;
            // One right option keeps only the first of several.
            onChange((current) => ({ ...current, type, right: type === "multiple-choice" ? current.right.slice(0, 1) : current.right }));
          }}
        >
          <option value="multiple-choice">{t("maker.typeChoice")}</option>
          <option value="multiple-select">{t("maker.typeMulti")}</option>
          <option value="short-answer">{t("maker.typeShort")}</option>
        </select>
      </label>

      <label className="maker-field">
        <span>{t("maker.prompt")}</span>
        <textarea
          rows={3}
          value={own.prompt}
          maxLength={limits.maxPrompt}
          aria-describedby={`${id}-prompt-hint`}
          onChange={(event) => {
            const prompt = event.currentTarget.value;
            onChange((current) => ({ ...current, prompt }));
          }}
        />
        <span className="field-hint" id={`${id}-prompt-hint`}>
          {t("maker.promptHint")}
        </span>
      </label>
      {own.prompt.trim() && (
        <div className="maker-preview" aria-label={t("maker.preview")}>
          <span className="maker-preview-label">{t("maker.preview")}</span>
          <p className="maker-preview-prompt">
            <MathText text={own.prompt} />
          </p>
        </div>
      )}

      {choice ? (
        <fieldset className="maker-options">
          <legend>{t("maker.options")}</legend>
          {own.options.map((option, index) => {
            const letter = LETTERS[index];
            const isRight = own.right.includes(index);
            return (
              <div key={index} className={`maker-option${isRight ? " right" : ""}`}>
                <span className="option-letter" aria-hidden="true">
                  {letter}
                </span>
                <input
                  type="text"
                  value={option}
                  maxLength={limits.maxOption}
                  aria-label={fill(t("maker.optionN"), { letter })}
                  onChange={(event) => {
                    const text = event.currentTarget.value;
                    onChange((current) => ({
                      ...current,
                      options: current.options.map((other, place) => (place === index ? text : other))
                    }));
                  }}
                />
                <label className="maker-right">
                  <input
                    type={own.type === "multiple-choice" ? "radio" : "checkbox"}
                    name={`${id}-right`}
                    checked={isRight}
                    aria-label={fill(t("maker.rightOptionAria"), { letter })}
                    onChange={(event) => setRight(index, event.currentTarget.checked)}
                  />
                  <span aria-hidden="true">{t("maker.rightOption")}</span>
                </label>
                {own.options.length > limits.minOptions && (
                  <button
                    type="button"
                    className="ghost-button maker-remove-option"
                    aria-label={fill(t("maker.removeOption"), { letter })}
                    onClick={() => removeOption(index)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          {own.options.length < limits.maxOptions && (
            <button
              type="button"
              className="link-button"
              onClick={() => onChange((current) => ({ ...current, options: [...current.options, ""] }))}
            >
              + {t("maker.addOption")}
            </button>
          )}
        </fieldset>
      ) : (
        <label className="maker-field">
          <span>{t("maker.answer")}</span>
          <input
            type="text"
            value={own.shortAnswer}
            maxLength={limits.maxAnswer}
            aria-describedby={`${id}-answer-hint`}
            onChange={(event) => {
              const shortAnswer = event.currentTarget.value;
              onChange((current) => ({ ...current, shortAnswer }));
            }}
          />
          <span className="field-hint" id={`${id}-answer-hint`}>
            {t("maker.answerHint")}
          </span>
        </label>
      )}

      <label className="maker-field">
        <span>{t("maker.explanation")}</span>
        <textarea
          rows={2}
          value={own.explanation}
          maxLength={limits.maxExplanation}
          aria-describedby={`${id}-explanation-hint`}
          onChange={(event) => {
            const explanation = event.currentTarget.value;
            onChange((current) => ({ ...current, explanation }));
          }}
        />
        <span className="field-hint" id={`${id}-explanation-hint`}>
          {t("maker.explanationHint")}
        </span>
      </label>

      <div className="maker-field">
        <span>{t("maker.picture")}</span>
        {own.imageUrl && (
          <img className="maker-picture" src={own.imageUrl} alt={fill(t("maker.pictureAlt"), { n: String(number) })} />
        )}
        <div className="maker-picture-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="visually-hidden"
            id={`${id}-picture`}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button type="button" className="ghost-button" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? t("maker.uploading") : own.imageUrl ? t("maker.changePicture") : t("maker.addPicture")}
          </button>
          {own.imageUrl && (
            <button
              type="button"
              className="link-button"
              onClick={() => onChange((current) => ({ ...current, imageUrl: null }))}
            >
              {t("maker.removePicture")}
            </button>
          )}
        </div>
        <span className="field-hint">{t("maker.pictureHint")}</span>
        {uploadError !== null && <StudentTestErrorBanner cause={uploadError} />}
      </div>
    </div>
  );
}

/** The bank, to pick questions from: by topic or words, shown without answers. */
function BankPicker({
  subjectId,
  catalog,
  picked,
  full,
  onAdd,
  onClose
}: {
  subjectId: string;
  catalog: CatalogSubject[];
  picked: ReadonlySet<string>;
  full: boolean;
  onAdd: (question: ExamQuestion) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [topicId, setTopicId] = useState("");
  const [search, setSearch] = useState("");
  const [asked, setAsked] = useState(search);
  const [load, setLoad] = useState<
    { status: "loading" } | { status: "ready"; questions: ExamQuestion[] } | { status: "error"; cause: unknown }
  >({ status: "loading" });
  const topics = catalog.find((subject) => subject.id === subjectId)?.topics ?? [];

  // The search is sent a moment after typing stops, not on every key.
  useEffect(() => {
    const timer = window.setTimeout(() => setAsked(search), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoad({ status: "loading" });
    fetchBankForPicking(subjectId, { topicId: topicId || undefined, search: asked })
      .then((questions) => active && setLoad({ status: "ready", questions }))
      .catch((cause: unknown) => active && setLoad({ status: "error", cause }));
    return () => {
      active = false;
    };
  }, [subjectId, topicId, asked]);

  return (
    <div className="maker-bank" role="region" aria-labelledby="maker-bank-title">
      <div className="maker-bank-head">
        <h3 id="maker-bank-title">
          {t("maker.bankTitle")}: {subjectLabel(t, subjectId)}
        </h3>
        <button type="button" className="ghost-button" onClick={onClose}>
          {t("maker.close")}
        </button>
      </div>
      <p className="field-hint">{t("maker.bankHint")}</p>
      <div className="maker-fields">
        <label className="maker-field">
          <span>{t("maker.bankTopic")}</span>
          <select value={topicId} onChange={(event) => setTopicId(event.currentTarget.value)}>
            <option value="">{t("maker.bankAllTopics")}</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topicLabel(t, subjectId, topic.id, topic.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="maker-field">
          <span>{t("maker.bankSearch")}</span>
          <input
            type="search"
            value={search}
            placeholder={t("maker.bankSearchPlaceholder")}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </label>
      </div>

      {load.status === "loading" && (
        <p className="panel-hint" role="status">
          {t("maker.bankLoading")}
        </p>
      )}
      {load.status === "error" && <StudentTestErrorBanner cause={load.cause} />}
      {load.status === "ready" &&
        (load.questions.length === 0 ? (
          <p className="panel-hint">{t("maker.bankEmpty")}</p>
        ) : (
          <ul className="maker-bank-list">
            {load.questions.map((question) => {
              const added = picked.has(question.id);
              return (
                <li key={question.id} className="maker-bank-item">
                  <div className="maker-bank-text">
                    <span className="maker-bank-meta">
                      {topicLabel(t, question.subjectId, question.topicId)} ·{" "}
                      <span className="level-tag" data-level={question.difficulty}>
                        {difficultyLabel(t, question.difficulty)}
                      </span>
                    </span>
                    <BankItemPreview question={question} />
                  </div>
                  <button
                    type="button"
                    className={added ? "ghost-button" : "primary-button"}
                    disabled={added || full}
                    onClick={() => onAdd(question)}
                  >
                    {added ? t("maker.added") : t("maker.add")}
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
