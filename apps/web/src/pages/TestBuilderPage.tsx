import { useEffect, useMemo, useState } from "react";
import type { Difficulty, DifficultyMode } from "@grade9/shared";
import { customLimits, difficultyPresets } from "@grade9/shared";
import { navigate } from "../app/router";
import { saveActiveTest } from "../lib/examSession";
import { fetchCatalog, generateMockTest, type CatalogSubject } from "../services/testsApi";

const difficultyOptions: Array<{ mode: DifficultyMode; label: string; detail: string }> = [
  { mode: "easy", label: "Easy", detail: difficultyPresets.easy.description },
  { mode: "medium", label: "Medium", detail: difficultyPresets.medium.description },
  { mode: "hard", label: "Hard", detail: difficultyPresets.hard.description },
  { mode: "custom", label: "Custom", detail: "Choose the length and timer yourself" }
];

export function TestBuilderPage() {
  const [catalog, setCatalog] = useState<CatalogSubject[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [subjectId, setSubjectId] = useState("math");
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>("easy");

  const [customCount, setCustomCount] = useState(10);
  const [customMinutes, setCustomMinutes] = useState(20);
  const [untimed, setUntimed] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalog()
      .then((subjects) => {
        setCatalog(subjects);
        const first = subjects.find((subject) => subject.total > 0) ?? subjects[0];
        if (first) {
          setSubjectId(first.id);
          setTopicIds(first.topics.filter((topic) => topic.total > 0).map((topic) => topic.id));
        }
      })
      .catch((cause: Error) => setLoadError(cause.message));
  }, []);

  const subject = useMemo(
    () => catalog?.find((item) => item.id === subjectId) ?? null,
    [catalog, subjectId]
  );

  /** How many questions the bank can actually supply for the current choices. */
  const availableCount = useMemo(() => {
    if (!subject) return 0;

    return subject.topics
      .filter((topic) => topicIds.includes(topic.id))
      .reduce((total, topic) => {
        if (difficultyMode === "custom") return total + topic.total;
        return total + topic.counts[difficultyMode as Difficulty];
      }, 0);
  }, [subject, topicIds, difficultyMode]);

  const requestedCount =
    difficultyMode === "custom" ? customCount : difficultyPresets[difficultyMode].questionCount;

  function toggleTopic(topicId: string) {
    setTopicIds((current) =>
      current.includes(topicId)
        ? current.filter((item) => item !== topicId)
        : [...current, topicId]
    );
  }

  async function handleGenerate() {
    setError(null);

    if (topicIds.length === 0) {
      setError("Choose at least one topic.");
      return;
    }

    setGenerating(true);

    try {
      const response = await generateMockTest({
        subjectId,
        topicIds,
        difficultyMode,
        questionCount: difficultyMode === "custom" ? customCount : undefined,
        timeLimitMinutes: difficultyMode === "custom" ? (untimed ? null : customMinutes) : undefined
      });

      saveActiveTest({
        test: response.test,
        startedAt: Date.now(),
        short: response.short,
        requestedCount: response.requestedCount
      });

      navigate("/exam");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  if (loadError) {
    return (
      <div className="stack">
        <h1>Create a mock test</h1>
        <p className="error-banner">{loadError}</p>
      </div>
    );
  }

  if (!catalog || !subject) {
    return (
      <div className="stack">
        <h1>Create a mock test</h1>
        <p>Loading subjects...</p>
      </div>
    );
  }

  const bankIsEmpty = catalog.every((item) => item.total === 0);

  return (
    <div className="stack">
      <section>
        <h1>Create a mock test</h1>
        <p className="lede">
          Pick what you want to practise. Results, mistakes and explanations are shown at the end,
          the same way a real exam works.
        </p>
      </section>

      {bankIsEmpty && (
        <p className="warning-banner">
          There are no questions in the bank yet. Add some from the{" "}
          <a href="#/admin">admin dashboard</a> first.
        </p>
      )}

      <section className="panel">
        <h2>Subject</h2>
        <div className="chip-row">
          {catalog.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip ${item.id === subjectId ? "selected" : ""}`}
              onClick={() => {
                setSubjectId(item.id);
                setTopicIds(item.topics.filter((topic) => topic.total > 0).map((topic) => topic.id));
              }}
            >
              {item.name}
              <span className="chip-count">{item.total}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Topics</h2>
        <div className="topic-grid">
          {subject.topics.map((topic) => (
            <label key={topic.id} className={`topic-option ${topic.total === 0 ? "empty" : ""}`}>
              <input
                type="checkbox"
                checked={topicIds.includes(topic.id)}
                onChange={() => toggleTopic(topic.id)}
              />
              <span className="topic-name">{topic.name}</span>
              <span className="topic-count">
                {topic.total === 0
                  ? "no questions yet"
                  : `${topic.total} question${topic.total === 1 ? "" : "s"}`}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Difficulty</h2>
        <p className="panel-hint">
          Easy, medium and hard set the number of questions and the timer for you. Choose custom to
          set them yourself.
        </p>
        <div className="difficulty-grid">
          {difficultyOptions.map((option) => (
            <button
              key={option.mode}
              type="button"
              className={`difficulty-card ${option.mode === difficultyMode ? "selected" : ""}`}
              onClick={() => setDifficultyMode(option.mode)}
              aria-pressed={option.mode === difficultyMode}
            >
              <span className="difficulty-label">{option.label}</span>
              <span className="difficulty-detail">{option.detail}</span>
            </button>
          ))}
        </div>

        {difficultyMode === "custom" && (
          <div className="custom-settings">
            <label>
              Number of questions
              <input
                type="number"
                min={customLimits.minQuestions}
                max={customLimits.maxQuestions}
                value={customCount}
                onChange={(event) =>
                  setCustomCount(
                    Math.min(
                      customLimits.maxQuestions,
                      Math.max(customLimits.minQuestions, Number(event.target.value) || 0)
                    )
                  )
                }
              />
            </label>

            <label>
              Time limit (minutes)
              <input
                type="number"
                min={customLimits.minMinutes}
                max={customLimits.maxMinutes}
                value={customMinutes}
                disabled={untimed}
                onChange={(event) =>
                  setCustomMinutes(
                    Math.min(
                      customLimits.maxMinutes,
                      Math.max(customLimits.minMinutes, Number(event.target.value) || 0)
                    )
                  )
                }
              />
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={untimed}
                onChange={(event) => setUntimed(event.target.checked)}
              />
              No timer - take as long as I need
            </label>
          </div>
        )}
      </section>

      <section className="panel summary-panel">
        <div>
          <strong>{Math.min(requestedCount, availableCount)}</strong> question
          {Math.min(requestedCount, availableCount) === 1 ? "" : "s"} ready
          {availableCount < requestedCount && (
            <span className="summary-warning">
              {" "}
              - you asked for {requestedCount}, but the bank only has {availableCount} for this
              selection
            </span>
          )}
        </div>

        {error && <p className="error-banner">{error}</p>}

        <button
          type="button"
          className="primary-button"
          onClick={handleGenerate}
          disabled={generating || availableCount === 0}
        >
          {generating ? "Building your test..." : "Start mock test"}
        </button>
      </section>
    </div>
  );
}
