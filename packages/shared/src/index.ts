export type Difficulty = "easy" | "medium" | "hard" | "mixed";

export type QuestionType = "multiple-choice" | "short-answer" | "mixed";

export interface Topic {
  id: string;
  name: string;
}

export interface Subject {
  id: string;
  name: string;
  topics: Topic[];
}

export interface TestSettings {
  subjectId: string;
  topicIds: string[];
  difficulty: Difficulty;
  questionType: QuestionType;
  questionCount: number;
  timeLimitMinutes: number;
}

export interface Question {
  id: string;
  type: Exclude<QuestionType, "mixed">;
  subjectId: string;
  topicId: string;
  difficulty: Exclude<Difficulty, "mixed">;
  prompt: string;
  options?: string[];
  answer: string;
  explanation: string;
}

export interface MockTest {
  id: string;
  title: string;
  settings: TestSettings;
  questions: Question[];
  createdAt: string;
}

export interface TopicPerformance {
  topicId: string;
  correctAnswers: number;
  totalQuestions: number;
}

export interface TestResult {
  score: number;
  percentage: number;
  correctAnswers: number;
  incorrectAnswers: number;
  timeTakenSeconds: number;
  topicBreakdown: TopicPerformance[];
}

export const subjects: Subject[] = [
  {
    id: "math",
    name: "Mathematics",
    topics: [
      { id: "algebra", name: "Algebra" },
      { id: "geometry", name: "Geometry" },
      { id: "statistics", name: "Statistics" }
    ]
  },
  {
    id: "science",
    name: "Science",
    topics: [
      { id: "biology", name: "Biology" },
      { id: "chemistry", name: "Chemistry" },
      { id: "physics", name: "Physics" }
    ]
  },
  {
    id: "english",
    name: "English",
    topics: [
      { id: "reading", name: "Reading Comprehension" },
      { id: "grammar", name: "Grammar" },
      { id: "writing", name: "Writing" }
    ]
  }
];
