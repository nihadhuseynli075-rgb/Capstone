import { randomUUID } from "node:crypto";
import { subjects, type MockTest, type TestSettings } from "@grade9/shared";

export function createStarterMockTest(settings: TestSettings): MockTest {
  const subject = subjects.find((item) => item.id === settings.subjectId);
  const topic = subject?.topics.find((item) => item.id === settings.topicIds[0]);

  return {
    id: randomUUID(),
    title: `${subject?.name ?? "Grade 9"} ${topic?.name ?? "Practice"} Mock Test`,
    settings,
    questions: [
      {
        id: randomUUID(),
        type: "multiple-choice",
        subjectId: settings.subjectId,
        topicId: settings.topicIds[0],
        difficulty: settings.difficulty === "mixed" ? "medium" : settings.difficulty,
        prompt: "This is a starter question. Replace this with AI-generated exam-style content.",
        options: ["Sample answer A", "Sample answer B", "Sample answer C", "Sample answer D"],
        answer: "Sample answer A",
        explanation: "This placeholder shows where the final answer explanation will appear."
      }
    ],
    createdAt: new Date().toISOString()
  };
}
