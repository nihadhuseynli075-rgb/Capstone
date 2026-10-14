import { forwardRef, Fragment, useEffect, useImperativeHandle, useRef, useState, type ForwardedRef } from "react";
import type {
  BankQuestion,
  Difficulty,
  QuestionDraft,
  QuestionTranslation,
  QuestionTranslations,
  QuestionType
} from "@grade9/shared";
import { followsSiteLanguage, markLimits, paperYearLimits, repeatedOption, subjects, testScopeLimits, topicIdFor } from "@grade9/shared";
import { adminLanguageNames, adminText } from "./adminText";
import { uploadQuestionImage } from "../services/adminApi";
import { ApiError } from "../services/apiClient";

/**
 * Every question on a DIM paper has five options, A to E, so the form offers
 * five. A question saved with fewer (the older four-option ones) leaves the
 * rest empty; one saved with more keeps them all (see paddedOptions).
 */
const OPTION_SLOTS = 5;

/** The options as typed, padded with empty ones up to the slots the form always offers. */
function paddedOptions(options: readonly string[]): string[] {
  const padded = [...options];
  while (padded.length < OPTION_SLOTS) padded.push("");
  return padded;
}

function emptyOptions(): string[] {
  return paddedOptions([]);
}

/** The largest diagram the API stores, so a bigger one is turned away before it is sent. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * The languages the form offers a translation in. Azerbaijani has none yet, so
 * a student reading the site in it gets the question as first written; any that
 * a question already has are kept when it is saved.
 */
const translationLanguages = ["en", "ru"] as const;

type TranslationLanguage = (typeof translationLanguages)[number];

/**
 * One language's translation as it is typed. The options sit in the same slots
 * as the question's own, so slot B here is the translation of option B.
 */
interface TranslationInput {
  prompt: string;
  options: string[];
  explanation: string;
  correctAnswer: string;
}

type TranslationInputs = Record<TranslationLanguage, TranslationInput>;

function emptyTranslation(): TranslationInput {
  return { prompt: "", options: emptyOptions(), explanation: "", correctAnswer: "" };
}

function emptyTranslations(): TranslationInputs {
  return { en: emptyTranslation(), ru: emptyTranslation() };
}

function translationInputs(saved: QuestionTranslations): TranslationInputs {
  const inputs = emptyTranslations();

  for (const language of translationLanguages) {
    const translation = saved[language];
    if (!translation) continue;

    inputs[language] = {
      prompt: translation.prompt,
      options: paddedOptions(translation.options ?? []),
      explanation: translation.explanation ?? "",
      correctAnswer: translation.correctAnswer ?? ""
    };
  }

  return inputs;
}

function languageLabel(language: TranslationLanguage): string {
  return adminLanguageNames[language];
}

/** The fields a problem with the form can be about (see fail), by their data-field. */
type ProblemField = "topic" | "prompt" | "option" | "correct" | "answer" | "marks" | "image";

/**
 * Something that stops the question being saved.
 *
 * One about a field is shown right under that field, which is marked invalid;
 * one that belongs to no one field (a translation, say) is shown above the
 * button. Every message used to go above the button, which on a long form was
 * a screen or more below the field it was about.
 */
interface FormProblem {
  message: string;
  field: ProblemField | null;
  /** Which of the fields with that name, for the option rows. */
  nth: number;
}

const problemId = (field: ProblemField) => `question-form-error-${field}`;

/**
 * The option texts and the radio that marks the right one are one question to
 * get right, so changing either clears a problem with either.
 */
const problemGroup = (field: string) => (field === "correct" ? "option" : field);

/**
 * A problem's message, under the field it is about. Its id is what that
 * field's aria-describedby points at, so a screen reader reads it with the
 * field; it is an alert as well, so it is heard even when focus does not move.
 */
function FieldProblem({ problem, field, nth = 0 }: { problem: FormProblem | null; field: ProblemField; nth?: number }) {
  if (problem?.field !== field || problem.nth !== nth) return null;
  return (
    <p className="field-error" role="alert" id={problemId(field)}>
      {problem.message}
    </p>
  );
}

/**
 * A picture chosen under Diagram that is not attached to the question yet.
 *
 * It is kept, file and all, until it is attached or removed. A save while it
 * was still uploading, or after its upload failed, used to go ahead without
 * it, and the question went out to students with no diagram.
 */
type ChosenPicture =
  | { file: File; state: "uploading" }
  /**
   * Refused because the admin session had ended. It goes up again as soon as
   * the admin has signed back in, and `thenSave` says a save is waiting on it.
   */
  | { file: File; state: "waiting-for-sign-in"; thenSave: boolean }
  /** `canRetry` is false where sending the same file again cannot help: a file that is not a picture, or too big. */
  | { file: File; state: "failed"; message: string; canRetry: boolean };

/** What the page can ask of the form. */
export interface QuestionFormHandle {
  /**
   * Carries on once the admin has signed in again after the session ended: a
   * picture refused for want of a session is uploaded, and a save that was
   * waiting is made from the form as it stands, so it includes that picture.
   */
  resumeAfterSignIn(saveWaiting: boolean): void;
}

/**
 * What a paper's questions have in common, kept from one question to the next.
 *
 * Someone typing in a paper adds a run of questions with the same subject,
 * topic, difficulty, year and source. Starting each from empty meant picking
 * all five again every time. The question itself, its options and its
 * explanation are never carried, so nothing of the last question leaks into
 * the next.
 */
export interface QuestionCarryOver {
  subjectId: string;
  topicId: string;
  difficulty: Difficulty;
  paperYear: number | null;
  source: string | null;
}

/**
 * The question entry form.
 *
 * Laid out like a survey form on purpose: one question per screen, fill it in,
 * submit. Subject is a fixed list, but topic is free text with suggestions,
 * because the real topic names are still being read off the past papers and
 * should not need a code change to add.
 *
 * It starts from `initial` (a question being edited) or from empty, and does
 * not follow later changes to either: the page gives it a new `key` for each
 * question, which is also how it is emptied after one has been added.
 */
export const QuestionForm = forwardRef(function QuestionForm(
  {
    initial,
    carryOver,
    onSubmit,
    onCancel,
    submitting,
    error,
    onEdited,
    onSessionEnded
  }: {
    initial: BankQuestion | null;
    /** Only used when there is no `initial`. */
    carryOver?: QuestionCarryOver | null;
    onSubmit: (draft: QuestionDraft) => void;
    onCancel?: () => void;
    submitting: boolean;
    error: string | null;
    /** Called when the form is edited or fails a check, so the page can drop a notice about the last save. */
    onEdited?: () => void;
    /**
     * Called when a picture's upload is refused because the admin session has
     * ended, so the page can ask for the password straight away. The picture
     * is kept and sent again from resumeAfterSignIn.
     */
    onSessionEnded?: () => void;
  },
  ref: ForwardedRef<QuestionFormHandle>
) {
  const kept = initial ? null : (carryOver ?? null);

  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? kept?.subjectId ?? "math");
  const [topicId, setTopicId] = useState(initial?.topicId ?? kept?.topicId ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? kept?.difficulty ?? "medium");
  const [type, setType] = useState<QuestionType>(initial?.type ?? "multiple-choice");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [options, setOptions] = useState<string[]>(() => paddedOptions(initial?.options ?? []));
  // -1 is "none marked yet". A draft whose answer is not one of its options
  // (often none have been typed) used to open with A marked, and saving after
  // typing the options stored A as the answer without anyone choosing it.
  const [correctIndex, setCorrectIndex] = useState(() =>
    initial ? initial.options.indexOf(initial.correctAnswer) : 0
  );
  /** The answer a draft arrived with when it matches no option, shown so the right one can be marked. */
  const unmatchedAnswer =
    initial && initial.type === "multiple-choice" && initial.correctAnswer.trim() && !initial.options.includes(initial.correctAnswer)
      ? initial.correctAnswer.trim()
      : null;
  // Short answers and written questions both keep their text here: the answer
  // for one, the marking guide for the other.
  const [shortAnswer, setShortAnswer] = useState(
    initial && initial.type !== "multiple-choice" ? initial.correctAnswer : ""
  );
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [marks, setMarks] = useState(initial ? String(initial.marks) : "1");
  const [paperYear, setPaperYear] = useState(() => {
    const year = initial ? initial.paperYear : (kept?.paperYear ?? null);
    return year === null ? "" : String(year);
  });
  const [source, setSource] = useState(initial?.source ?? kept?.source ?? "");
  const [translations, setTranslations] = useState<TranslationInputs>(() =>
    initial ? translationInputs(initial.translations ?? {}) : emptyTranslations()
  );

  const [chosen, setChosen] = useState<ChosenPicture | null>(null);
  // Each upload is numbered, so one that answers after a newer choice (or
  // after the picture was removed) cannot attach the older picture over it.
  const uploadCount = useRef(0);
  // Bumped to save the form as it stands once the page has drawn the latest
  // state: after a picture uploaded on signing in again, the save must see it.
  const [saveRequests, setSaveRequests] = useState(0);
  const [problem, setProblem] = useState<FormProblem | null>(null);
  // For moving focus to the field a problem is about (see fail).
  const formRef = useRef<HTMLFormElement>(null);

  // A failed check means the last save's notice no longer fits under the button.
  useEffect(() => {
    if (problem) onEdited?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem]);

  // Through the button's own path, so the save is checked like any other.
  useEffect(() => {
    if (saveRequests > 0) formRef.current?.requestSubmit();
  }, [saveRequests]);

  useImperativeHandle(ref, () => ({
    resumeAfterSignIn(saveWaiting) {
      if (chosen?.state === "waiting-for-sign-in") {
        void upload(chosen.file, saveWaiting || chosen.thenSave);
      } else if (saveWaiting) {
        setSaveRequests((count) => count + 1);
      }
    }
  }));

  const knownTopics = subjects.find((subject) => subject.id === subjectId)?.topics ?? [];

  function setOption(index: number, value: string) {
    setOptions((current) => current.map((option, position) => (position === index ? value : option)));
  }

  function changeTranslation(language: TranslationLanguage, changes: Partial<TranslationInput>) {
    setTranslations((current) => ({ ...current, [language]: { ...current[language], ...changes } }));
  }

  /**
   * The translations to save, or the sentence that says what is wrong with them.
   *
   * A translated option is kept only where the question's own option in that
   * slot is filled in. Clearing option B above takes its translation with it,
   * rather than leaving every option after it paired with the wrong one.
   */
  function buildTranslations(): QuestionTranslations | string {
    // A question that does not follow the site language has none to save, and
    // one that used to and no longer does has nothing left to keep.
    if (!followsSiteLanguage(subjectId)) return {};

    // Languages the form has no fields for are passed through as they were.
    const built: QuestionTranslations = { ...(initial?.translations ?? {}) };
    for (const language of translationLanguages) delete built[language];

    const filledSlots = options.flatMap((option, slot) => (option.trim().length > 0 ? [slot] : []));

    for (const language of translationLanguages) {
      const typed = translations[language];
      const prompt = typed.prompt.trim();
      const explanation = typed.explanation.trim();
      const correctAnswer = type === "short-answer" ? typed.correctAnswer.trim() : "";
      // A slot the translation was never given is empty, not missing: a question
      // can have more options than the translation was sized for.
      const translatedOptions =
        type === "multiple-choice" ? filledSlots.map((slot) => (typed.options[slot] ?? "").trim()) : [];
      const hasOptions = translatedOptions.some((option) => option.length > 0);

      if (prompt.length === 0 && explanation.length === 0 && correctAnswer.length === 0 && !hasOptions) continue;

      if (prompt.length === 0) return `${languageLabel(language)}: ${adminText.translationErrorNoPrompt}`;
      if (hasOptions && translatedOptions.some((option) => option.length === 0)) {
        return `${languageLabel(language)}: ${adminText.translationErrorOptions}`;
      }

      const translation: QuestionTranslation = { prompt };
      if (hasOptions) translation.options = translatedOptions;
      if (explanation.length > 0) translation.explanation = explanation;
      if (correctAnswer.length > 0) translation.correctAnswer = correctAnswer;
      built[language] = translation;
    }

    return built;
  }

  function handleImageChange(input: HTMLInputElement) {
    const file = input.files?.[0];
    // Emptied at once, so the same file can be chosen again after it has been
    // removed or fixed: a file input fires no change for the file it holds.
    input.value = "";
    if (!file) return;

    // Checked here, before anything is sent: a file over the limit used to
    // come back as a bare "request entity too large", and one that is not a
    // picture as "That upload is not valid.". The API checks both again,
    // and what the file really is.
    if (!file.type.startsWith("image/")) {
      choosePicture({ file, state: "failed", message: "Only image files are supported. Choose a PNG, JPG or WebP picture.", canRetry: false });
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      choosePicture({ file, state: "failed", message: "Images must be 2 MB or smaller.", canRetry: false });
      return;
    }

    void upload(file);
  }

  /**
   * A new state for the chosen picture. Whatever the form last said about the
   * picture ("still uploading", say) no longer applies. Read from the current
   * state, not this render's: an upload ends long after the render it began in.
   */
  function changeChosen(next: ChosenPicture | null) {
    setChosen(next);
    setProblem((current) => (current?.field === "image" ? null : current));
  }

  /** A new choice (or none): an upload still on its way for the old one is ignored when it answers. */
  function choosePicture(next: ChosenPicture | null) {
    uploadCount.current += 1;
    changeChosen(next);
  }

  /**
   * Sends the picture and attaches it. A refusal for want of a session is the
   * page's to handle, as with any other request: it asks for the password at
   * once, and the picture goes up again after (see resumeAfterSignIn). It used
   * to be caught here, which left only "Admin sign-in required." under the
   * field, and the question was then saved without its picture.
   */
  async function upload(file: File, thenSave = false) {
    choosePicture({ file, state: "uploading" });
    const thisUpload = uploadCount.current;

    try {
      const url = await uploadQuestionImage(file);
      if (thisUpload !== uploadCount.current) return;
      setImageUrl(url);
      changeChosen(null);
      if (thenSave) setSaveRequests((count) => count + 1);
    } catch (cause) {
      if (thisUpload !== uploadCount.current) return;
      if (cause instanceof ApiError && cause.status === 401) {
        changeChosen({ file, state: "waiting-for-sign-in", thenSave });
        onSessionEnded?.();
        return;
      }
      // The API turns the same file away every time; a dropped connection or
      // a server error may well go through on a second try.
      const refused = cause instanceof ApiError && (cause.status === 400 || cause.status === 413);
      changeChosen({ file, state: "failed", message: (cause as Error).message, canRetry: !refused });
    }
  }

  /*
   * Shows a problem with the form and moves focus to the field it is about
   * (the nth of that kind, for the option rows), or to the message itself
   * when no one field is to blame. The message used to appear under the form
   * while focus stayed on the button, so a screen reader heard nothing and a
   * keyboard user had to hunt back up for the field. Focus waits a frame for
   * the message to be drawn.
   */
  function fail(message: string, field: ProblemField | null, nth = 0) {
    setProblem({ message, field, nth });
    window.requestAnimationFrame(() => {
      const form = formRef.current;
      const target =
        (field ? form?.querySelectorAll<HTMLElement>(`[data-field="${field}"]`)[nth] : null) ??
        form?.querySelector<HTMLElement>("#question-form-error");
      if (!target) return;
      target.focus({ preventScroll: true });
      // Focus does not scroll to a field that already has it: one typed in
      // and then scrolled away from, with the button pressed by a click that
      // leaves focus where it was (as Safari's does). So the message and then
      // the field, with its label, are brought into view, and all of it ends
      // up on screen.
      if (field) document.getElementById(problemId(field))?.scrollIntoView({ block: "nearest" });
      (target.closest<HTMLElement>(".form-field, .image-field, .option-input-row") ?? target).scrollIntoView({ block: "nearest" });
    });
  }

  /** Marks the field a problem is about as invalid, and ties it to the message under it. */
  function problemProps(field: ProblemField, nth = 0) {
    return problem?.field === field && problem.nth === nth
      ? { "aria-invalid": true, "aria-describedby": problemId(field) }
      : {};
  }

  /*
   * Any change tells the page the last save's notice is out of date. A change
   * to the field a problem is about also takes the problem's message away:
   * it described the field as it was, and the next save checks it again.
   */
  function handleFormChange(event: React.FormEvent<HTMLFormElement>) {
    onEdited?.();
    const changed = (event.target as HTMLElement).dataset?.field;
    if (problem?.field && changed && problemGroup(changed) === problemGroup(problem.field)) setProblem(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // The button is disabled while saving, but a second press can land before
    // the page has drawn that, and would save the same question twice.
    if (submitting) return;

    setProblem(null);

    const filledOptions = options.map((option) => option.trim()).filter((option) => option.length > 0);

    if (topicId.trim().length === 0) {
      fail("Give the question a topic.", "topic");
      return;
    }

    if (prompt.trim().length === 0) {
      fail("Type the question text.", "prompt");
      return;
    }

    if (type === "multiple-choice") {
      if (filledOptions.length < 2) {
        // The first of the two required boxes that is still empty.
        fail("Fill in at least two options.", "option", options[0].trim() ? 1 : 0);
        return;
      }
      // Marked by the text picked, so both copies would count as correct.
      const repeated = repeatedOption(filledOptions);
      if (repeated !== null) {
        const second = options.map((option) => option.trim()).lastIndexOf(repeated);
        fail(`Two options are the same ("${repeated}"). Each option has to be different.`, "option", second);
        return;
      }
      // The correct answer is stored by text, so a gap in the option list must
      // not silently shift which option is marked correct.
      if ((options[correctIndex] ?? "").trim().length === 0) {
        fail("Mark which option is the correct answer.", "correct", Math.max(0, correctIndex));
        return;
      }
    } else if (shortAnswer.trim().length === 0) {
      fail(type === "open-ended" ? "Write the marking guide." : "Type the correct answer.", "answer");
      return;
    }

    const markValue = Number(marks);

    if (!Number.isInteger(markValue) || markValue < markLimits.min || markValue > markLimits.max) {
      fail(`Marks has to be a whole number between ${markLimits.min} and ${markLimits.max}.`, "marks");
      return;
    }

    const year = Number.parseInt(paperYear, 10);

    const builtTranslations = buildTranslations();

    if (typeof builtTranslations === "string") {
      fail(builtTranslations, null);
      return;
    }

    // The picture is only attached once its upload answers. Saving before then,
    // or after the upload failed, stored the question without it, ready for
    // students, and the picture was lost.
    if (chosen) {
      fail(
        chosen.state !== "failed"
          ? "The picture is still uploading. Save once it has finished."
          : chosen.canRetry
            ? "The picture you chose has not been attached. Try again, or remove it to save the question without it."
            : "The picture you chose cannot be attached. Choose another one, or remove it to save the question without it.",
        "image"
      );
      return;
    }

    onSubmit({
      subjectId,
      // What was typed may be a topic's name rather than its id.
      topicId: topicIdFor(topicId, knownTopics),
      difficulty,
      type,
      prompt: prompt.trim(),
      options: type === "multiple-choice" ? filledOptions : [],
      correctAnswer:
        type === "multiple-choice" ? (options[correctIndex] ?? "").trim() : shortAnswer.trim(),
      explanation: explanation.trim(),
      imageUrl,
      marks: markValue,
      paperYear: Number.isFinite(year) ? year : null,
      source: source.trim() || null,
      translations: builtTranslations
    });
  }

  const banner = problem ? (problem.field === null ? problem.message : null) : error;
  // A picture waiting for the admin to sign in again is on its way too: it is
  // sent the moment they have.
  const uploading = chosen?.state === "uploading" || chosen?.state === "waiting-for-sign-in";

  return (
    <form className="question-form" onSubmit={handleSubmit} onChange={handleFormChange} ref={formRef}>
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

        {/* The label and its problem together, so the message sits under the
            field and is not read as part of the field's name. */}
        <div className="form-field">
          <label>
            Topic
            <input
              type="text"
              list="known-topics"
              data-field="topic"
              maxLength={testScopeLimits.maxIdLength}
              value={topicId}
              onChange={(event) => setTopicId(event.target.value)}
              placeholder="e.g. algebra"
              {...problemProps("topic")}
            />
            <datalist id="known-topics">
              {knownTopics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </datalist>
          </label>
          <FieldProblem problem={problem} field="topic" />
        </div>

        <label>
          Difficulty
          <select
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as Difficulty)}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>

        <label>
          Answer type
          <select value={type} onChange={(event) => setType(event.target.value as QuestionType)}>
            <option value="multiple-choice">Multiple choice</option>
            <option value="short-answer">Short answer</option>
            <option value="open-ended">Written answer (AI-marked)</option>
          </select>
        </label>
      </div>

      <div className="form-field">
        <label>
          Question
          <textarea
            rows={3}
            data-field="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Type the question exactly as it appears on the paper"
            {...problemProps("prompt")}
          />
        </label>
        <FieldProblem problem={problem} field="prompt" />
      </div>

      {type === "multiple-choice" ? (
        <fieldset className="options-fieldset">
          <legend>Options - select the correct one</legend>
          {unmatchedAnswer !== null && (
            <p className="panel-hint">
              The answer recorded for this question is "{unmatchedAnswer}", which is not one of the options
              yet. Type the options, then mark the correct one.
            </p>
          )}
          {options.map((option, index) => (
            <Fragment key={index}>
              <div className="option-input-row">
                {/* The radio and its letter are one label, so the whole 44px
                    square around them picks the answer, not just a 13px dot. */}
                <label className="option-correct">
                  <input
                    type="radio"
                    name="correct-option"
                    data-field="correct"
                    checked={correctIndex === index}
                    onChange={() => setCorrectIndex(index)}
                    aria-label={`Option ${String.fromCharCode(65 + index)} is correct`}
                    {...problemProps("correct", index)}
                  />
                  <span className="option-letter" aria-hidden="true">
                    {String.fromCharCode(65 + index)}
                  </span>
                </label>
                {/* Named for a screen reader, which otherwise heard only
                    "Required" or "Optional", the placeholder. */}
                <input
                  type="text"
                  data-field="option"
                  value={option}
                  aria-label={`Option ${String.fromCharCode(65 + index)}`}
                  onChange={(event) => setOption(index, event.target.value)}
                  placeholder={index < 2 ? "Required" : "Optional"}
                  {...problemProps("option", index)}
                />
              </div>
              {/* Under the row it is about: the empty option, the repeated
                  one, or the radio marking an option with no text. */}
              <FieldProblem problem={problem} field="option" nth={index} />
              <FieldProblem problem={problem} field="correct" nth={index} />
            </Fragment>
          ))}
        </fieldset>
      ) : type === "open-ended" ? (
        <div className="form-field">
          <label>
            Marking guide
            <textarea
              rows={5}
              data-field="answer"
              value={shortAnswer}
              onChange={(event) => setShortAnswer(event.target.value)}
              placeholder={
                "What earns each mark, as the paper's mark scheme says. For example:\n" +
                "1 mark: explains the meaning in their own words.\n" +
                "1 mark: gives a supporting example from the text."
              }
              {...problemProps("answer")}
            />
            <span className="field-hint">
              The AI marker acts as a Grade 9 teacher and marks only against this guide, so spell out
              what each mark needs. Students see it after the test.
            </span>
          </label>
          <FieldProblem problem={problem} field="answer" />
        </div>
      ) : (
        <div className="form-field">
          <label>
            Correct answer
            <input
              type="text"
              data-field="answer"
              value={shortAnswer}
              onChange={(event) => setShortAnswer(event.target.value)}
              placeholder="Marking ignores capitals and extra spaces"
              {...problemProps("answer")}
            />
          </label>
          <FieldProblem problem={problem} field="answer" />
        </div>
      )}

      <label>
        Explanation
        <textarea
          rows={2}
          value={explanation}
          onChange={(event) => setExplanation(event.target.value)}
          placeholder="Why the correct answer is right. Shown to the student after the test."
        />
      </label>

      {followsSiteLanguage(subjectId) && (
        // Open when the question already has some, so they are not hidden from
        // the person who put them there. Keyed so another question starts shut.
        <details
          key={initial?.id ?? "new"}
          className="translations-section"
          open={Object.keys(initial?.translations ?? {}).length > 0}
        >
          <summary>
            {adminText.translationsTitle} <span className="field-hint">({adminText.translationsOptional})</span>
          </summary>

          <p className="panel-hint">{adminText.translationsIntro}</p>

          {translationLanguages.map((language) => (
            <TranslationBlock
              key={language}
              language={language}
              type={type}
              baseOptions={options}
              correctIndex={correctIndex}
              value={translations[language]}
              onChange={(changes) => changeTranslation(language, changes)}
            />
          ))}
        </details>
      )}

      <div className="form-row">
        <div className="form-field">
          <label>
            Marks
            <input
              type="number"
              min={markLimits.min}
              max={markLimits.max}
              data-field="marks"
              value={marks}
              onChange={(event) => setMarks(event.target.value)}
              placeholder="1"
              {...problemProps("marks")}
            />
            <span className="field-hint">What the paper says the question is worth.</span>
          </label>
          <FieldProblem problem={problem} field="marks" />
        </div>

        <label>
          Paper year
          <input
            type="number"
            // The limits the API holds the year to, from the shared package
            // rather than a copy that could drift from it.
            min={paperYearLimits.min}
            max={paperYearLimits.max}
            value={paperYear}
            onChange={(event) => setPaperYear(event.target.value)}
            placeholder="e.g. 2024"
          />
        </label>

        <label>
          Source
          <input
            type="text"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="e.g. 2024 final paper 1"
          />
        </label>
      </div>

      <div className="image-field">
        <label>
          Diagram (optional)
          {/* Not while saving: a picture chosen then missed the save under
              way, and was gone when the form emptied for the next question. */}
          <input
            type="file"
            accept="image/*"
            data-field="image"
            disabled={submitting}
            onChange={(event) => handleImageChange(event.currentTarget)}
            {...problemProps("image")}
          />
        </label>

        {chosen?.state === "uploading" && (
          <p className="panel-hint" role="status">
            Uploading {chosen.file.name}...
          </p>
        )}
        {chosen?.state === "waiting-for-sign-in" && (
          <p className="panel-hint" role="status">
            {chosen.file.name} is uploaded as soon as you have signed in again.
          </p>
        )}
        {chosen?.state === "failed" && (
          <div className="picture-failed">
            <p className="error-banner" role="alert">
              {chosen.file.name} was not attached: {chosen.message}
            </p>
            <div className="form-actions">
              {chosen.canRetry && (
                <button type="button" className="ghost-button" onClick={() => void upload(chosen.file)}>
                  Try again
                </button>
              )}
              <button
                type="button"
                className="ghost-button"
                aria-label={`Remove ${chosen.file.name}`}
                onClick={() => choosePicture(null)}
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {imageUrl && (
          <div className="image-preview">
            <img src={imageUrl} alt="Question diagram preview" />
            <button type="button" className="ghost-button" onClick={() => setImageUrl(null)}>
              Remove image
            </button>
          </div>
        )}

        <FieldProblem problem={problem} field="image" />
      </div>

      {/* An alert, so a refusal is read out wherever focus is; focusable by
          script for a problem that belongs to no one field (see fail). A
          problem with one field is under that field instead, and while there
          is one, the API's answer to an earlier save no longer applies. */}
      {banner && (
        <p className="error-banner" role="alert" id="question-form-error" tabIndex={-1}>
          {banner}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={submitting || uploading}>
          {submitting ? "Saving..." : uploading ? "Uploading the diagram..." : initial ? "Save changes" : "Add question"}
        </button>
        {onCancel && (
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
});

/**
 * One language's fields for a question's translation.
 *
 * Each translated option sits beside the option it translates, with that
 * option's letter and text next to it. The order is what pairs them, so it is
 * shown rather than left to be assumed.
 */
function TranslationBlock({
  language,
  type,
  baseOptions,
  correctIndex,
  value,
  onChange
}: {
  language: TranslationLanguage;
  type: QuestionType;
  baseOptions: string[];
  correctIndex: number;
  value: TranslationInput;
  onChange: (changes: Partial<TranslationInput>) => void;
}) {
  const label = languageLabel(language);
  const filledSlots = baseOptions.flatMap((option, slot) => (option.trim().length > 0 ? [slot] : []));

  return (
    <fieldset className="translation-block">
      <legend>{label}</legend>

      <label>
        {adminText.translationPrompt}
        <textarea rows={2} value={value.prompt} onChange={(event) => onChange({ prompt: event.target.value })} />
      </label>

      {type === "multiple-choice" && (
        <fieldset className="options-fieldset">
          <legend>{adminText.translationOptions}</legend>

          {filledSlots.length === 0 && <p className="field-hint">{adminText.translationAddOptionsFirst}</p>}

          {filledSlots.map((slot) => (
            <div key={slot} className="translation-option-row">
              <span className="option-letter">{String.fromCharCode(65 + slot)}</span>
              <input
                type="text"
                value={value.options[slot] ?? ""}
                aria-label={`${label}, ${adminText.translationOptionFor} ${String.fromCharCode(65 + slot)}`}
                onChange={(event) => {
                  const options = [...value.options];
                  while (options.length <= slot) options.push("");
                  options[slot] = event.target.value;
                  onChange({ options });
                }}
              />
              <span className="field-hint translation-option-base">
                {adminText.translationOptionFor} {baseOptions[slot].trim()}
                {slot === correctIndex && (
                  <strong className="translation-correct"> - {adminText.translationCorrectOption}</strong>
                )}
              </span>
            </div>
          ))}
        </fieldset>
      )}

      {type === "short-answer" && (
        <label>
          {adminText.translationAnswer}
          <input
            type="text"
            value={value.correctAnswer}
            onChange={(event) => onChange({ correctAnswer: event.target.value })}
          />
          <span className="field-hint">{adminText.translationAnswerHint}</span>
        </label>
      )}

      <label>
        {adminText.translationExplanation}
        <textarea
          rows={2}
          value={value.explanation}
          onChange={(event) => onChange({ explanation: event.target.value })}
        />
      </label>
    </fieldset>
  );
}
