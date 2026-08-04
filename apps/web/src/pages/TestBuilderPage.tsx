import { useState } from "react";
import { subjects, type Difficulty, type QuestionType, type TestSettings } from "@grade9/shared";
import { generateMockTest } from "../services/testsApi";

const defaultSettings: TestSettings = {
  subjectId: "math",
  topicIds: ["algebra"],
  difficulty: "mixed",
  questionType: "mixed",
  questionCount: 10,
  timeLimitMinutes: 30
};

export function TestBuilderPage() {
  const [settings, setSettings] = useState<TestSettings>(defaultSettings);
  const [status, setStatus] = useState("Ready to generate a practice test.");

  const selectedSubject = subjects.find((subject) => subject.id === settings.subjectId) ?? subjects[0];

  async function handleGenerate() {
    setStatus("Generating a starter mock test...");
    const test = await generateMockTest(settings);
    setStatus(`Created "${test.title}" with ${test.questions.length} sample questions.`);
  }

  return (
    <main className="page-shell">
      <section className="intro">
        <p className="eyebrow">Grade 9 Final Exam Prep</p>
        <h1>AI mock test builder</h1>
        <p>
          Choose a subject, topic, difficulty, and test length. This starter app currently returns sample
          questions from the API and leaves real AI generation for the next milestone.
        </p>
      </section>

      <section className="builder-grid" aria-label="Mock test settings">
        <label>
          Subject
          <select
            value={settings.subjectId}
            onChange={(event) =>
              setSettings({
                ...settings,
                subjectId: event.target.value,
                topicIds: [subjects.find((subject) => subject.id === event.target.value)?.topics[0]?.id ?? ""]
              })
            }
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Topic
          <select
            value={settings.topicIds[0]}
            onChange={(event) => setSettings({ ...settings, topicIds: [event.target.value] })}
          >
            {selectedSubject.topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Difficulty
          <select
            value={settings.difficulty}
            onChange={(event) => setSettings({ ...settings, difficulty: event.target.value as Difficulty })}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>

        <label>
          Question type
          <select
            value={settings.questionType}
            onChange={(event) => setSettings({ ...settings, questionType: event.target.value as QuestionType })}
          >
            <option value="multiple-choice">Multiple choice</option>
            <option value="short-answer">Short answer</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>

        <label>
          Questions
          <input
            type="number"
            min="5"
            max="50"
            value={settings.questionCount}
            onChange={(event) => setSettings({ ...settings, questionCount: Number(event.target.value) })}
          />
        </label>

        <label>
          Time limit
          <input
            type="number"
            min="10"
            max="180"
            value={settings.timeLimitMinutes}
            onChange={(event) => setSettings({ ...settings, timeLimitMinutes: Number(event.target.value) })}
          />
        </label>
      </section>

      <section className="actions" aria-live="polite">
        <button type="button" onClick={handleGenerate}>
          Generate mock test
        </button>
        <p>{status}</p>
      </section>
    </main>
  );
}
