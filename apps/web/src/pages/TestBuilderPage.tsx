import { useEffect, useId, useMemo, useState } from "react";
import type { AttemptSummary, Difficulty, DifficultyMode } from "@grade9/shared";
import { customLimits, difficultyPresets } from "@grade9/shared";
import { navigate, useRouteParam } from "../app/router";
import { ResumeTestBanner } from "../components/ResumeTestBanner";
import { useAuth } from "../features/auth/AuthContext";
import { fill } from "../features/friends/fill";
import { saveActiveTest } from "../lib/examSession";
import { useLanguage, type TranslationKey } from "../lib/i18n";
import { difficultyLabel, subjectLabel, testErrorText, topicLabel } from "../lib/testText";
import {
  fetchCatalog,
  fetchHistory,
  generateMockTest,
  type CatalogSubject
} from "../services/testsApi";

const difficultyModes: DifficultyMode[] = ["easy", "medium", "hard", "custom"];

type CatalogTopic = CatalogSubject["topics"][number];

/**
 * How many questions a topic can supply at this difficulty. A preset draws
 * only questions of its own difficulty; custom draws from all three.
 */
function questionsAt(topic: CatalogTopic, mode: DifficultyMode): number {
  return mode === "custom" ? topic.total : topic.counts[mode];
}

/**
 * The count on a topic's card, for the difficulty chosen below. It used to
 * count every difficulty, so a topic reading "3 questions" could give none on
 * Easy while the summary said the bank had nothing for the choice.
 */
function topicCountText(
  topic: CatalogTopic,
  mode: DifficultyMode,
  t: (key: TranslationKey) => string,
  tn: (key: TranslationKey, count: number) => string
): string {
  if (topic.total === 0) return t("builder.noQuestions");

  const count = questionsAt(topic, mode);
  if (mode === "custom") return tn("count.questions", count);

  const difficulty = difficultyLabel(t, mode);
  if (count === 0) return fill(t("builder.topicNoneAt"), { difficulty });
  return fill(t("builder.topicCountAt"), { questions: tn("count.questions", count), difficulty });
}

/** Why a difficulty cannot be chosen: nothing of that difficulty in the topics picked. */
const noQuestionsYet: Record<Difficulty, TranslationKey> = {
  easy: "builder.noneEasy",
  medium: "builder.noneMedium",
  hard: "builder.noneHard"
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
    .reduce((total, topic) => total + questionsAt(topic, mode), 0);
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

/**
 * The number a custom box stands for: what it says, pulled into range, or the
 * last number it settled on while it holds no number at all.
 *
 * The box itself is left as typed until it loses focus. Clamping on every key
 * turned a 2 on the way to 20 into a 5, and the 0 then made it 50.
 */
function boxValue(text: string, settled: number, min: number, max: number): number {
  if (!/^\d+$/.test(text)) return settled;
  return Math.min(max, Math.max(min, Number(text)));
}

/** A custom number box: what is typed, and the number it last settled on. */
function useNumberBox(initial: number, min: number, max: number) {
  const [text, setText] = useState(String(initial));
  const [settled, setSettled] = useState(initial);
  const value = boxValue(text, settled, min, max);

  return {
    text,
    value,
    // Digits only, so the box can be emptied and refilled but never holds
    // something that is not a number on its way to the request.
    change: (next: string) => setText(next.replace(/\D/g, "")),
    // Shows the student the number the test will use, once they are done typing.
    settle: () => {
      setSettled(value);
      setText(String(value));
      return value;
    }
  };
}

/** Bold on the number in a sentence like "12 questions ready", wherever the language puts it. */
function withBoldNumber(text: string, count: number) {
  const at = text.indexOf(String(count));
  if (at === -1) return text;

  return (
    <>
      {text.slice(0, at)}
      <strong>{count}</strong>
      {text.slice(at + String(count).length)}
    </>
  );
}

export function TestBuilderPage() {
  const { ready, user } = useAuth();
  const { language, t, tn } = useLanguage();
  const [catalog, setCatalog] = useState<CatalogSubject[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [history, setHistory] = useState<AttemptSummary[] | null>(null);

  const [subjectId, setSubjectId] = useState("math");
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>("easy");

  const countBox = useNumberBox(10, customLimits.minQuestions, customLimits.maxQuestions);
  const minutesBox = useNumberBox(20, customLimits.minMinutes, customLimits.maxMinutes);
  const [untimed, setUntimed] = useState(false);
  const countHintId = useId();
  const minutesHintId = useId();

  const [generating, setGenerating] = useState(false);
  // What went wrong rather than its sentence, so switching the site language
  // while it is on screen says it again in the new language.
  const [error, setError] = useState<{ key: TranslationKey } | { cause: unknown } | null>(null);

  const requestedSubject = useRouteParam("subject");

  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch((cause: unknown) => setLoadError(cause));
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

  // The count the test will be asked for: the custom box as it would settle
  // now, so the line below never promises a number that starting would change.
  const requestedCount =
    difficultyMode === "custom" ? countBox.value : difficultyPresets[difficultyMode].questionCount;

  function toggleTopic(topicId: string) {
    setTopicIds((current) =>
      current.includes(topicId)
        ? current.filter((item) => item !== topicId)
        : [...current, topicId]
    );
  }

  async function handleGenerate() {
    setError(null);

    // Settled here as well as on blur: pressing Enter, or a tap that does not
    // move focus, can start the test with a box still mid-edit.
    const questionCount = countBox.settle();
    const minutes = minutesBox.settle();

    if (topicIds.length === 0) {
      setError({ key: "builder.noTopic" });
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
        questionCount: difficultyMode === "custom" ? questionCount : undefined,
        timeLimitMinutes: difficultyMode === "custom" ? (untimed ? null : minutes) : undefined,
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
      setError({ cause });
    } finally {
      setGenerating(false);
    }
  }

  if (loadError !== null) {
    return (
      <div className="stack">
        <h1>{t("builder.title")}</h1>
        <p className="error-banner">{testErrorText(loadError, t)}</p>
      </div>
    );
  }

  const intro = (
    <section>
      <h1>{t("builder.title")}</h1>
      {/* No question has an explanation yet, so this promises the score and
          the right answers, which every question has. An explanation still
          shows on the results page wherever a question has one. */}
      <p className="lede">{t("builder.lede")}</p>
    </section>
  );

  // The builder's own shape while the catalog is on its way. A line of text
  // left the footer on screen to be pushed away when the subjects arrived (a
  // layout shift over 0.1 on a slow phone), and nothing worth drawing was on
  // screen until then. The panels and their grey blocks take roughly the room
  // the real ones will.
  //
  // The panels carry the same keys here and in the loaded page below. Matched
  // by position instead, React reused the skeleton's Difficulty and summary
  // panels, far down the page, as the real Subject and Topics panels, which
  // jumped up into view when the subjects arrived (a layout shift of 0.72).
  if (!catalog || !subject) {
    return (
      <div className="stack" aria-busy="true">
        {intro}

        <section className="panel" key="subject">
          <h2>{t("builder.subject")}</h2>
          <p className="panel-hint" role="status">
            {t("builder.loading")}
          </p>
          <div className="chip-row" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <span key={index} className="skeleton skeleton-chip" />
            ))}
          </div>
        </section>

        <section className="panel" key="topics" aria-hidden="true">
          <h2>{t("builder.topics")}</h2>
          <div className="topic-grid">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <span key={index} className="skeleton skeleton-tile" />
            ))}
          </div>
        </section>

        <section className="panel" key="difficulty" aria-hidden="true">
          <h2>{t("builder.difficulty")}</h2>
          <div className="difficulty-grid">
            {[0, 1, 2, 3].map((index) => (
              <span key={index} className="skeleton skeleton-card" />
            ))}
          </div>
        </section>

        <section className="panel summary-panel" key="summary" aria-hidden="true">
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-button" />
        </section>
      </div>
    );
  }

  const bankIsEmpty = catalog.every((item) => item.total === 0);

  // The link sits wherever the language puts it in the sentence.
  const [bankEmptyBefore, bankEmptyAfter = ""] = t("builder.bankEmpty").split("{link}");

  return (
    <div className="stack">
      {intro}

      <ResumeTestBanner />

      {bankIsEmpty && (
        <p className="warning-banner">
          {bankEmptyBefore}
          <a href="#/admin">{t("builder.bankEmptyLink")}</a>
          {bankEmptyAfter}
        </p>
      )}

      <section className="panel" key="subject">
        <h2>{t("builder.subject")}</h2>
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
              {subjectLabel(t, item.id, item.name)}
              <span className="chip-count">{item.total}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel" key="topics">
        <h2>{t("builder.topics")}</h2>
        <div className="topic-grid">
          {subject.topics.map((topic) => {
            const selected = topicIds.includes(topic.id);
            const last = lastScores.get(topic.id);
            const band = last === undefined ? "" : scoreBand(last);

            return (
              <label
                key={topic.id}
                className={`topic-option ${questionsAt(topic, difficultyMode) === 0 ? "empty" : ""} ${
                  selected ? "selected" : ""
                }`}
              >
                <input type="checkbox" checked={selected} onChange={() => toggleTopic(topic.id)} />
                <span className="topic-name">{topicLabel(t, subject.id, topic.id, topic.name)}</span>
                <span className="topic-count">
                  {topicCountText(topic, difficultyMode, t, tn)}
                  {/* "Not tried yet" only once something in this subject has
                      been: on a first visit it would be on every tile and say
                      nothing. Nor on a topic with no questions to try. */}
                  {last !== undefined ? (
                    <span className={`topic-last ${band}`}>
                      {" · "}
                      {fill(t("builder.lastScore"), { n: String(last) })}
                    </span>
                  ) : (
                    lastScores.size > 0 &&
                    topic.total > 0 && <span className="topic-last"> · {t("builder.notTried")}</span>
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

      <section className="panel" key="difficulty">
        <h2>{t("builder.difficulty")}</h2>
        <p className="panel-hint">{t("builder.difficultyHint")}</p>
        {/* Each card says what it can actually draw from the topics picked. The
            Hard card used to promise 50 questions with none in the bank, and
            the Start button stayed greyed out with no reason on the card. */}
        <div className="difficulty-grid">
          {difficultyModes.map((mode) => {
            const selected = mode === difficultyMode;
            const drawable = drawableCount(subject, topicIds, mode);
            const empty = mode !== "custom" && drawable === 0;

            return (
              <button
                key={mode}
                type="button"
                className={`difficulty-card ${selected ? "selected" : ""}`}
                onClick={() => setDifficultyMode(mode)}
                aria-pressed={selected}
                // Left pressable while chosen, so it still shows why nothing can start.
                disabled={empty && !selected}
              >
                <span className="difficulty-label">{difficultyLabel(t, mode)}</span>
                <span className="difficulty-detail">
                  {/* Built from the preset's own numbers, so retuning a preset
                      in the shared package retunes this line in every language. */}
                  {mode === "custom"
                    ? t("builder.customDetail")
                    : fill(t("builder.presetDetail"), {
                        questions: tn("count.questions", difficultyPresets[mode].questionCount),
                        minutes: tn("count.minutes", difficultyPresets[mode].timeLimitMinutes)
                      })}
                </span>
                <span className={`difficulty-ready ${empty ? "empty" : ""}`}>
                  {mode === "custom"
                    ? fill(t("builder.customReady"), { available: String(drawable) })
                    : empty
                      ? t(noQuestionsYet[mode])
                      : fill(t("builder.presetReady"), {
                          available: String(Math.min(drawable, difficultyPresets[mode].questionCount)),
                          asked: String(difficultyPresets[mode].questionCount)
                        })}
                </span>
              </button>
            );
          })}
        </div>

        {difficultyMode === "custom" && (
          <div className="custom-settings">
            {/* Text boxes rather than number ones, which clamp, round and
                swallow an empty value on their own terms in each browser.
                inputMode still brings up the number pad on a phone. */}
            <label>
              {t("builder.countLabel")}
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={countBox.text}
                aria-describedby={countHintId}
                onChange={(event) => countBox.change(event.target.value)}
                onBlur={() => countBox.settle()}
              />
              <span className="field-hint" id={countHintId}>
                {fill(t("builder.countRange"), {
                  min: String(customLimits.minQuestions),
                  max: String(customLimits.maxQuestions)
                })}
              </span>
            </label>

            <label>
              {t("builder.minutesLabel")}
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={minutesBox.text}
                disabled={untimed}
                aria-describedby={minutesHintId}
                onChange={(event) => minutesBox.change(event.target.value)}
                onBlur={() => minutesBox.settle()}
              />
              <span className="field-hint" id={minutesHintId}>
                {fill(t("builder.minutesRange"), {
                  min: String(customLimits.minMinutes),
                  max: String(customLimits.maxMinutes)
                })}
              </span>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={untimed}
                onChange={(event) => setUntimed(event.target.checked)}
              />
              {t("builder.untimed")}
            </label>
          </div>
        )}
      </section>

      <section className="panel summary-panel" key="summary">
        {/* With nothing ticked the real problem is the topics, not the size of
            the bank: "the bank only has 0" sent students looking for missing
            questions, and the button it disabled kept the right message from
            ever showing. */}
        {topicIds.length === 0 ? (
          <div className="summary-warning" role="status">
            {t("builder.noTopic")}
          </div>
        ) : (
          <div>
            {withBoldNumber(
              tn("builder.ready", Math.min(requestedCount, availableCount)),
              Math.min(requestedCount, availableCount)
            )}
            {availableCount < requestedCount && (
              <span className="summary-warning">
                {" "}
                {fill(t("builder.short"), {
                  requested: String(requestedCount),
                  available: String(availableCount)
                })}
              </span>
            )}
          </div>
        )}

        {error && (
          <p className="error-banner">
            {"key" in error ? t(error.key) : testErrorText(error.cause, t, "test.errNoQuestions")}
          </p>
        )}

        <button
          type="button"
          className="primary-button"
          onClick={handleGenerate}
          disabled={generating || availableCount === 0}
        >
          {generating ? t("builder.building") : t("builder.start")}
        </button>
      </section>
    </div>
  );
}
