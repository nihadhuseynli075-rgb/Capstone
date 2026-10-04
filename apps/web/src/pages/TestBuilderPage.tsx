import { useEffect, useMemo, useState } from "react";
import type { AttemptSummary, Difficulty, DifficultyMode } from "@grade9/shared";
import { customLimits, difficultyPresets } from "@grade9/shared";
import { navigate, useRouteParam } from "../app/router";
import { ResumeTestBanner } from "../components/ResumeTestBanner";
import { useAuth } from "../features/auth/AuthContext";
import { saveActiveTest } from "../lib/examSession";
import { fill, useLanguage, type TranslationKey } from "../lib/i18n";
import {
  fetchCatalog,
  fetchHistory,
  generateMockTest,
  type CatalogSubject
} from "../services/testsApi";

const difficultyOptions: Array<{ mode: DifficultyMode; label: string; detail: string }> = [
  { mode: "easy", label: "Easy", detail: difficultyPresets.easy.description },
  { mode: "medium", label: "Medium", detail: difficultyPresets.medium.description },
  { mode: "hard", label: "Hard", detail: difficultyPresets.hard.description },
  { mode: "custom", label: "Custom", detail: "Choose the length and timer yourself" }
];

/** Why a difficulty cannot be chosen: nothing of that difficulty in the topics picked. */
const noQuestionsYet: Record<Difficulty, TranslationKey> = {
  easy: "build.noneEasy",
  medium: "build.noneMedium",
  hard: "build.noneHard"
};

const presetModes: Difficulty[] = ["easy", "medium", "hard"];

/**
 * How many questions a test of this kind can draw from these topics: the
 * questions of that difficulty, or every question for a custom test. The same
 * pool the API draws from (see mockTestGenerator), so the two cannot disagree.
 */
function drawableCount(subject: CatalogSubject | null, topicIds: string[], mode: DifficultyMode): number {
  if (!subject) return 0;

  return subject.topics
    .filter((topic) => topicIds.includes(topic.id))
    .reduce((total, topic) => total + (mode === "custom" ? topic.total : topic.counts[mode]), 0);
}

/**
 * The difficulty to start a subject on: the one already chosen if it can draw
 * anything there, otherwise the first that can. Opening a subject on a
 * difficulty it has no questions for only showed a dead Start button.
 */
function usableMode(subject: CatalogSubject, topicIds: string[], current: DifficultyMode): DifficultyMode {
  if (current === "custom" || drawableCount(subject, topicIds, current) > 0) return current;
  return presetModes.find((mode) => drawableCount(subject, topicIds, mode) > 0) ?? current;
}

/** The same bands as the topic bars on the results screen. */
function scoreBand(percent: number): "weak" | "ok" | "strong" {
  if (percent < 50) return "weak";
  if (percent < 80) return "ok";
  return "strong";
}

export function TestBuilderPage() {
  const { ready, user } = useAuth();
  const { language, t } = useLanguage();
  const [catalog, setCatalog] = useState<CatalogSubject[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<AttemptSummary[] | null>(null);

  const [subjectId, setSubjectId] = useState("math");
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>("easy");

  const [customCount, setCustomCount] = useState(10);
  const [customMinutes, setCustomMinutes] = useState(20);
  const [untimed, setUntimed] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestedSubject = useRouteParam("subject");

  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch((cause: Error) => setLoadError(cause.message));
  }, []);

  // A subject shortcut arrives as ?subject=, whether the builder is opening or
  // already open when the address changes. Otherwise start on the first subject
  // that has anything in it. Picking a subject by hand leaves the address alone,
  // so it is never undone by this.
  useEffect(() => {
    if (!catalog) return;

    const first =
      catalog.find((subject) => subject.id === requestedSubject) ??
      catalog.find((subject) => subject.total > 0) ??
      catalog[0];

    if (first) {
      const topics = first.topics.filter((topic) => topic.total > 0).map((topic) => topic.id);
      setSubjectId(first.id);
      setTopicIds(topics);
      setDifficultyMode((current) => usableMode(first, topics, current));
    }
  }, [catalog, requestedSubject]);

  // Past results, for the last score on each topic. Waits for the session like
  // the history page does, or a signed-in student is asked about with the guest
  // key. A failure costs the scores and nothing else: building a test does not
  // depend on them.
  useEffect(() => {
    if (!ready) return;

    let active = true;

    fetchHistory()
      .then((rows) => {
        if (active) setHistory(rows);
      })
      .catch(() => {
        if (active) setHistory([]);
      });

    return () => {
      active = false;
    };
  }, [ready, user?.id]);

  const subject = useMemo(
    () => catalog?.find((item) => item.id === subjectId) ?? null,
    [catalog, subjectId]
  );

  /**
   * The latest percentage on each topic of this subject. History comes newest
   * first, so the first result found for a topic is the one to keep. Only this
   * subject's attempts count: English and Russian both have a "grammar".
   */
  const lastScores = useMemo(() => {
    const scores = new Map<string, number>();

    for (const attempt of history ?? []) {
      if (attempt.subjectId !== subjectId) continue;

      for (const topic of attempt.topicBreakdown ?? []) {
        if (topic.marks > 0 && !scores.has(topic.topicId)) {
          scores.set(topic.topicId, Math.round((topic.score / topic.marks) * 100));
        }
      }
    }

    return scores;
  }, [history, subjectId]);

  /** How many questions the bank can actually supply for the current choices. */
  const availableCount = useMemo(
    () => drawableCount(subject, topicIds, difficultyMode),
    [subject, topicIds, difficultyMode]
  );

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

    // The button is disabled then too, but a test with nothing in it must not
    // be asked for whatever pressed it.
    if (availableCount === 0) return;

    setGenerating(true);

    try {
      const response = await generateMockTest({
        subjectId,
        topicIds,
        difficultyMode,
        questionCount: difficultyMode === "custom" ? customCount : undefined,
        timeLimitMinutes: difficultyMode === "custom" ? (untimed ? null : customMinutes) : undefined,
        language
      });

      saveActiveTest({
        test: response.test,
        startedAt: Date.now(),
        short: response.short,
        requestedCount: response.requestedCount,
        answers: {},
        currentIndex: 0
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
        {/* No question has an explanation yet, so this promises the score and
            the right answers, which every question has. An explanation still
            shows on the results page wherever a question has one. */}
        <p className="lede">
          Pick what you want to practise. Your score and your mistakes, with the right answers, are
          shown at the end, the same way a real exam works.
        </p>
      </section>

      <ResumeTestBanner />

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
                const topics = item.topics.filter((topic) => topic.total > 0).map((topic) => topic.id);
                setSubjectId(item.id);
                setTopicIds(topics);
                setDifficultyMode((current) => usableMode(item, topics, current));
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
          {subject.topics.map((topic) => {
            const selected = topicIds.includes(topic.id);
            const last = lastScores.get(topic.id);
            const band = last === undefined ? "" : scoreBand(last);

            return (
              <label
                key={topic.id}
                className={`topic-option ${topic.total === 0 ? "empty" : ""} ${
                  selected ? "selected" : ""
                }`}
              >
                <input type="checkbox" checked={selected} onChange={() => toggleTopic(topic.id)} />
                <span className="topic-name">{topic.name}</span>
                <span className="topic-count">
                  {topic.total === 0
                    ? "no questions yet"
                    : `${topic.total} question${topic.total === 1 ? "" : "s"}`}
                  {/* "Not tried yet" only once something in this subject has
                      been: on a first visit it would be on every tile and say
                      nothing. Nor on a topic with no questions to try. */}
                  {last !== undefined ? (
                    <span className={`topic-last ${band}`}> · Last score {last}%</span>
                  ) : (
                    lastScores.size > 0 &&
                    topic.total > 0 && <span className="topic-last"> · Not tried yet</span>
                  )}
                </span>
                {last !== undefined && (
                  <span className="topic-meter" aria-hidden="true">
                    <span className={`topic-meter-fill ${band}`} style={{ width: `${last}%` }} />
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Difficulty</h2>
        <p className="panel-hint">
          Easy, medium and hard set the number of questions and the timer for you. Choose custom to
          set them yourself.
        </p>
        {/* Each card says what it can actually draw from the topics picked. The
            Hard card used to promise 50 questions with none in the bank, and
            the Start button stayed greyed out with no reason on the card. */}
        <div className="difficulty-grid">
          {difficultyOptions.map((option) => {
            const selected = option.mode === difficultyMode;
            const drawable = drawableCount(subject, topicIds, option.mode);
            const empty = option.mode !== "custom" && drawable === 0;

            return (
              <button
                key={option.mode}
                type="button"
                className={`difficulty-card ${selected ? "selected" : ""}`}
                onClick={() => setDifficultyMode(option.mode)}
                aria-pressed={selected}
                // Left pressable while chosen, so it still shows why nothing can start.
                disabled={empty && !selected}
              >
                <span className="difficulty-label">{option.label}</span>
                <span className="difficulty-detail">{option.detail}</span>
                <span className={`difficulty-ready ${empty ? "empty" : ""}`}>
                  {option.mode === "custom"
                    ? fill(t("build.customReady"), { available: drawable })
                    : empty
                      ? t(noQuestionsYet[option.mode])
                      : fill(t("build.presetReady"), {
                          available: Math.min(drawable, difficultyPresets[option.mode].questionCount),
                          asked: difficultyPresets[option.mode].questionCount
                        })}
                </span>
              </button>
            );
          })}
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
