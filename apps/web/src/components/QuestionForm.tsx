import { useState } from "react";
import type {
  BankQuestion,
  Difficulty,
  QuestionDraft,
  QuestionTranslation,
  QuestionTranslations,
  QuestionType
} from "@grade9/shared";
import { followsSiteLanguage, markLimits, repeatedOption, subjects, topicIdFor } from "@grade9/shared";
import { languages, useLanguage } from "../lib/i18n";
import { uploadQuestionImage } from "../services/adminApi";

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
  return languages.find((item) => item.id === language)?.label ?? language;
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
export function QuestionForm({
  initial,
  carryOver,
  onSubmit,
  onCancel,
  submitting,
  error
}: {
  initial: BankQuestion | null;
  /** Only used when there is no `initial`. */
  carryOver?: QuestionCarryOver | null;
  onSubmit: (draft: QuestionDraft) => void;
  onCancel?: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const kept = initial ? null : (carryOver ?? null);

  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? kept?.subjectId ?? "math");
  const [topicId, setTopicId] = useState(initial?.topicId ?? kept?.topicId ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? kept?.difficulty ?? "medium");
  const [type, setType] = useState<QuestionType>(initial?.type ?? "multiple-choice");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [options, setOptions] = useState<string[]>(() => paddedOptions(initial?.options ?? []));
  const [correctIndex, setCorrectIndex] = useState(() =>
    initial ? Math.max(0, initial.options.indexOf(initial.correctAnswer)) : 0
  );
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

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { t } = useLanguage();

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

      if (prompt.length === 0) return `${languageLabel(language)}: ${t("translations.errorNoPrompt")}`;
      if (hasOptions && translatedOptions.some((option) => option.length === 0)) {
        return `${languageLabel(language)}: ${t("translations.errorOptions")}`;
      }

      const translation: QuestionTranslation = { prompt };
      if (hasOptions) translation.options = translatedOptions;
      if (explanation.length > 0) translation.explanation = explanation;
      if (correctAnswer.length > 0) translation.correctAnswer = correctAnswer;
      built[language] = translation;
    }

    return built;
  }

  async function handleImageChange(file: File | undefined) {
    if (!file) return;

    setUploadError(null);

    // Checked here, before anything is sent: a file over the limit used to
    // come back as a bare "request entity too large", and one that is not a
    // picture as "That upload is not valid.". The API checks both again,
    // and what the file really is.
    if (!file.type.startsWith("image/")) {
      setUploadError("Only image files are supported. Choose a PNG, JPG or WebP picture.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("Images must be 2 MB or smaller.");
      return;
    }

    setUploading(true);

    try {
      setImageUrl(await uploadQuestionImage(file));
    } catch (cause) {
      setUploadError((cause as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // The button is disabled while saving, but a second press can land before
    // the page has drawn that, and would save the same question twice.
    if (submitting) return;

    setFormError(null);

    const filledOptions = options.map((option) => option.trim()).filter((option) => option.length > 0);

    if (topicId.trim().length === 0) {
      setFormError("Give the question a topic.");
      return;
    }

    if (prompt.trim().length === 0) {
      setFormError("Type the question text.");
      return;
    }

    if (type === "multiple-choice") {
      if (filledOptions.length < 2) {
        setFormError("Fill in at least two options.");
        return;
      }
      // Marked by the text picked, so both copies would count as correct.
      const repeated = repeatedOption(filledOptions);
      if (repeated !== null) {
        setFormError(`Two options are the same ("${repeated}"). Each option has to be different.`);
        return;
      }
      // The correct answer is stored by text, so a gap in the option list must
      // not silently shift which option is marked correct.
      if ((options[correctIndex] ?? "").trim().length === 0) {
        setFormError("Mark which option is the correct answer.");
        return;
      }
    } else if (shortAnswer.trim().length === 0) {
      setFormError(type === "open-ended" ? "Write the marking guide." : "Type the correct answer.");
      return;
    }

    const markValue = Number(marks);

    if (!Number.isInteger(markValue) || markValue < markLimits.min || markValue > markLimits.max) {
      setFormError(
        `Marks has to be a whole number between ${markLimits.min} and ${markLimits.max}.`
      );
      return;
    }

    const year = Number.parseInt(paperYear, 10);

    const builtTranslations = buildTranslations();

    if (typeof builtTranslations === "string") {
      setFormError(builtTranslations);
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

  return (
    <form className="question-form" onSubmit={handleSubmit}>
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

        <label>
          Topic
          <input
            type="text"
            list="known-topics"
            value={topicId}
            onChange={(event) => setTopicId(event.target.value)}
            placeholder="e.g. algebra"
          />
          <datalist id="known-topics">
            {knownTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </datalist>
        </label>

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

      <label>
        Question
        <textarea
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Type the question exactly as it appears on the paper"
        />
      </label>

      {type === "multiple-choice" ? (
        <fieldset className="options-fieldset">
          <legend>Options - select the correct one</legend>
          {options.map((option, index) => (
            <div key={index} className="option-input-row">
              <input
                type="radio"
                name="correct-option"
                checked={correctIndex === index}
                onChange={() => setCorrectIndex(index)}
                aria-label={`Option ${String.fromCharCode(65 + index)} is correct`}
              />
              <span className="option-letter">{String.fromCharCode(65 + index)}</span>
              <input
                type="text"
                value={option}
                onChange={(event) => setOption(index, event.target.value)}
                placeholder={index < 2 ? "Required" : "Optional"}
              />
            </div>
          ))}
        </fieldset>
      ) : type === "open-ended" ? (
        <label>
          Marking guide
          <textarea
            rows={5}
            value={shortAnswer}
            onChange={(event) => setShortAnswer(event.target.value)}
            placeholder={
              "What earns each mark, as the paper's mark scheme says. For example:\n" +
              "1 mark: explains the meaning in their own words.\n" +
              "1 mark: gives a supporting example from the text."
            }
          />
          <span className="field-hint">
            The AI marker acts as a Grade 9 teacher and marks only against this guide, so spell out
            what each mark needs. Students see it after the test.
          </span>
        </label>
      ) : (
        <label>
          Correct answer
          <input
            type="text"
            value={shortAnswer}
            onChange={(event) => setShortAnswer(event.target.value)}
            placeholder="Marking ignores capitals and extra spaces"
          />
        </label>
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
            {t("translations.title")} <span className="field-hint">({t("translations.optional")})</span>
          </summary>

          <p className="panel-hint">{t("translations.intro")}</p>

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
        <label>
          Marks
          <input
            type="number"
            min={markLimits.min}
            max={markLimits.max}
            value={marks}
            onChange={(event) => setMarks(event.target.value)}
            placeholder="1"
          />
          <span className="field-hint">What the paper says the question is worth.</span>
        </label>

        <label>
          Paper year
          <input
            type="number"
            min="1900"
            max="2100"
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
          <input
            type="file"
            accept="image/*"
            onChange={(event) => void handleImageChange(event.target.files?.[0])}
          />
        </label>

        {uploading && <p className="panel-hint">Uploading...</p>}
        {uploadError && <p className="error-banner">{uploadError}</p>}

        {imageUrl && (
          <div className="image-preview">
            <img src={imageUrl} alt="Question diagram preview" />
            <button type="button" className="ghost-button" onClick={() => setImageUrl(null)}>
              Remove image
            </button>
          </div>
        )}
      </div>

      {(formError || error) && <p className="error-banner">{formError ?? error}</p>}

      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? "Saving..." : initial ? "Save changes" : "Add question"}
        </button>
        {onCancel && (
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

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
  const { t } = useLanguage();
  const label = languageLabel(language);
  const filledSlots = baseOptions.flatMap((option, slot) => (option.trim().length > 0 ? [slot] : []));

  return (
    <fieldset className="translation-block">
      <legend>{label}</legend>

      <label>
        {t("translations.prompt")}
        <textarea rows={2} value={value.prompt} onChange={(event) => onChange({ prompt: event.target.value })} />
      </label>

      {type === "multiple-choice" && (
        <fieldset className="options-fieldset">
          <legend>{t("translations.options")}</legend>

          {filledSlots.length === 0 && <p className="field-hint">{t("translations.addOptionsFirst")}</p>}

          {filledSlots.map((slot) => (
            <div key={slot} className="translation-option-row">
              <span className="option-letter">{String.fromCharCode(65 + slot)}</span>
              <input
                type="text"
                value={value.options[slot] ?? ""}
                aria-label={`${label}, ${t("translations.optionFor")} ${String.fromCharCode(65 + slot)}`}
                onChange={(event) => {
                  const options = [...value.options];
                  while (options.length <= slot) options.push("");
                  options[slot] = event.target.value;
                  onChange({ options });
                }}
              />
              <span className="field-hint translation-option-base">
                {t("translations.optionFor")} {baseOptions[slot].trim()}
                {slot === correctIndex && (
                  <strong className="translation-correct"> - {t("translations.correctOption")}</strong>
                )}
              </span>
            </div>
          ))}
        </fieldset>
      )}

      {type === "short-answer" && (
        <label>
          {t("translations.answer")}
          <input
            type="text"
            value={value.correctAnswer}
            onChange={(event) => onChange({ correctAnswer: event.target.value })}
          />
          <span className="field-hint">{t("translations.answerHint")}</span>
        </label>
      )}

      <label>
        {t("translations.explanation")}
        <textarea
          rows={2}
          value={value.explanation}
          onChange={(event) => onChange({ explanation: event.target.value })}
        />
      </label>
    </fieldset>
  );
}
