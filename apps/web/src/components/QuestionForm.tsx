import { useEffect, useState } from "react";
import type { BankQuestion, Difficulty, QuestionDraft, QuestionType } from "@grade9/shared";
import { subjects } from "@grade9/shared";
import { uploadQuestionImage } from "../services/adminApi";

const OPTION_SLOTS = 4;

function emptyOptions(): string[] {
  return Array.from({ length: OPTION_SLOTS }, () => "");
}

/**
 * The question entry form.
 *
 * Laid out like a survey form on purpose: one question per screen, fill it in,
 * submit. Subject is a fixed list, but topic is free text with suggestions,
 * because the real topic names are still being read off the past papers and
 * should not need a code change to add.
 */
export function QuestionForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  error
}: {
  initial: BankQuestion | null;
  onSubmit: (draft: QuestionDraft) => void;
  onCancel?: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [subjectId, setSubjectId] = useState("math");
  const [topicId, setTopicId] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [type, setType] = useState<QuestionType>("multiple-choice");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<string[]>(emptyOptions);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [shortAnswer, setShortAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [marks, setMarks] = useState("1");
  const [paperYear, setPaperYear] = useState("");
  const [source, setSource] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!initial) {
      setSubjectId("math");
      setTopicId("");
      setDifficulty("medium");
      setType("multiple-choice");
      setPrompt("");
      setOptions(emptyOptions());
      setCorrectIndex(0);
      setShortAnswer("");
      setExplanation("");
      setImageUrl(null);
      setMarks("1");
      setPaperYear("");
      setSource("");
      return;
    }

    setSubjectId(initial.subjectId);
    setTopicId(initial.topicId);
    setDifficulty(initial.difficulty);
    setType(initial.type);
    setPrompt(initial.prompt);

    const padded = [...initial.options];
    while (padded.length < OPTION_SLOTS) padded.push("");
    setOptions(padded);

    setCorrectIndex(Math.max(0, initial.options.indexOf(initial.correctAnswer)));
    setShortAnswer(initial.type === "short-answer" ? initial.correctAnswer : "");
    setExplanation(initial.explanation);
    setImageUrl(initial.imageUrl);
    setMarks(String(initial.marks));
    setPaperYear(initial.paperYear === null ? "" : String(initial.paperYear));
    setSource(initial.source ?? "");
  }, [initial]);

  const knownTopics = subjects.find((subject) => subject.id === subjectId)?.topics ?? [];

  function setOption(index: number, value: string) {
    setOptions((current) => current.map((option, position) => (position === index ? value : option)));
  }

  async function handleImageChange(file: File | undefined) {
    if (!file) return;

    setUploading(true);
    setUploadError(null);

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
      // The correct answer is stored by text, so a gap in the option list must
      // not silently shift which option is marked correct.
      if ((options[correctIndex] ?? "").trim().length === 0) {
        setFormError("Mark which option is the correct answer.");
        return;
      }
    } else if (shortAnswer.trim().length === 0) {
      setFormError("Type the correct answer.");
      return;
    }

    const markValue = Number.parseInt(marks, 10);

    if (!Number.isFinite(markValue) || markValue < 1) {
      setFormError("A question has to be worth at least one mark.");
      return;
    }

    const year = Number.parseInt(paperYear, 10);

    onSubmit({
      subjectId,
      topicId: topicId.trim().toLowerCase().replace(/\s+/g, "-"),
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
      source: source.trim() || null
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

      <div className="form-row">
        <label>
          Marks
          <input
            type="number"
            min="1"
            max="100"
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
