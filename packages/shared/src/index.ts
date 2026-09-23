/**
 * Shared contracts between the ExamPeak web app and API.
 *
 * Everything both sides need to agree on lives here: subjects, the difficulty
 * model, the question-bank record, and the result shapes.
 */

export type SubjectId = "math" | "english" | "russian";

/** Difficulty of an individual question in the bank. */
export type Difficulty = "easy" | "medium" | "hard";

/**
 * How the student sized their test.
 *
 * Picking easy/medium/hard applies a preset question count and timer.
 * Picking custom means they set the count and timer themselves.
 * It is one or the other, never both.
 */
export type DifficultyMode = Difficulty | "custom";

export type QuestionType = "multiple-choice" | "short-answer";

export interface Topic {
  id: string;
  name: string;
}

export interface Subject {
  id: string;
  name: string;
  topics: Topic[];
}

/**
 * Preset sizing for each difficulty.
 *
 * The guiding rule is roughly one minute per question at hard, with more
 * breathing room on the easier tests. Tune these numbers here and both the
 * builder UI and the API pick the change up.
 */
export interface DifficultyPreset {
  questionCount: number;
  timeLimitMinutes: number;
  description: string;
}

export const difficultyPresets: Record<Difficulty, DifficultyPreset> = {
  easy: {
    questionCount: 10,
    timeLimitMinutes: 15,
    description: "10 questions in 15 minutes"
  },
  medium: {
    questionCount: 25,
    timeLimitMinutes: 30,
    description: "25 questions in 30 minutes"
  },
  hard: {
    questionCount: 50,
    timeLimitMinutes: 50,
    description: "50 questions in 50 minutes"
  }
};

/**
 * What a single question may be worth.
 *
 * Shared rather than written out in each place that checks it. The admin form
 * and the API schema already agreed on a ceiling of 100; the spreadsheet
 * importer did not, which let one mis-typed cell make a question worth more
 * than the rest of the paper put together.
 */
export const markLimits = {
  min: 1,
  max: 100
} as const;

/**
 * The years a past paper can be from.
 *
 * Shared for the same reason as markLimits: the API schema allowed only these,
 * while the spreadsheet importer took any number at all, so one stray cell
 * could be saved as a nonsense year or, too large for the column, fail the
 * whole import.
 */
export const paperYearLimits = {
  min: 1900,
  max: 2100
} as const;

/**
 * How long a student key may be.
 *
 * Shared for the same reason again: the browser has to recognise a stored
 * guest key the API would refuse, and a copy of these numbers on each side
 * would drift until every request a guest makes failed.
 */
export const studentKeyLimits = {
  min: 8,
  max: 100
} as const;

export const customLimits = {
  minQuestions: 5,
  maxQuestions: 50,
  minMinutes: 5,
  maxMinutes: 180
} as const;

/**
 * What a profile may hold.
 *
 * Shared so the profile form and the API refuse the same names. The photo
 * limit is on the file as it is uploaded: the browser squares and shrinks a
 * photo to a few dozen kilobytes first, so only something that skipped that
 * step comes anywhere near it.
 */
export const profileLimits = {
  nameMin: 2,
  nameMax: 60,
  photoMaxBytes: 2 * 1024 * 1024
} as const;

/**
 * A student's profile: how they appear in the app.
 *
 * It lives in the `profiles` table and only the API writes it. The name kept
 * on the Supabase account is not the one to read: signing in with Google
 * rewrites that name and photo from Google every time, which would quietly
 * undo any change the student made here.
 */
export interface StudentProfile {
  id: string;
  fullName: string;
  email: string;
  /** Null when there is no photo, and the app shows initials instead. */
  avatarUrl: string | null;
  createdAt: string;
}

/**
 * What the student chose in the builder.
 *
 * A `timeLimitMinutes` of null means an untimed test, which is only reachable
 * from custom mode.
 */
export interface TestSettings {
  subjectId: string;
  topicIds: string[];
  difficultyMode: DifficultyMode;
  questionCount: number;
  timeLimitMinutes: number | null;
}

/** Resolves a difficulty mode into a concrete count and timer. */
export function resolveSettings(
  mode: DifficultyMode,
  custom?: { questionCount: number; timeLimitMinutes: number | null }
): Pick<TestSettings, "questionCount" | "timeLimitMinutes"> {
  if (mode === "custom") {
    return {
      questionCount: custom?.questionCount ?? customLimits.minQuestions,
      timeLimitMinutes: custom?.timeLimitMinutes ?? null
    };
  }

  const preset = difficultyPresets[mode];
  return {
    questionCount: preset.questionCount,
    timeLimitMinutes: preset.timeLimitMinutes
  };
}

/**
 * A question as stored in the bank, entered through the admin dashboard.
 *
 * `correctAnswer` always holds the answer text, never the letter. Imports that
 * supply a letter are resolved to the matching option on the way in, which
 * keeps marking and review rendering to a single simple comparison.
 */
export interface BankQuestion {
  id: string;
  subjectId: string;
  topicId: string;
  difficulty: Difficulty;
  type: QuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string;
  /**
   * What the question is worth, as printed on the paper.
   *
   * One unless the paper says otherwise, which is what makes a bank entered
   * before marks existed still score exactly as it did.
   */
  marks: number;
  explanation: string;
  imageUrl: string | null;
  paperYear: number | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The fields the admin dashboard actually submits. */
export type QuestionDraft = Omit<BankQuestion, "id" | "createdAt" | "updatedAt">;

/** A question as the student sees it: no answer, no explanation. */
export interface ExamQuestion {
  id: string;
  subjectId: string;
  topicId: string;
  difficulty: Difficulty;
  type: QuestionType;
  prompt: string;
  options: string[];
  /** Shown during the test, the way a paper prints "[3 marks]". */
  marks: number;
  imageUrl: string | null;
}

export interface MockTest {
  id: string;
  title: string;
  settings: TestSettings;
  questions: ExamQuestion[];
  createdAt: string;
}

export interface SubmittedAnswer {
  questionId: string;
  /**
   * Where the question sat in the paper.
   *
   * Sent alongside the id because deleting a question from the bank sets the
   * attempt's `question_id` to null, and an answer that could only be matched
   * by id would then be dropped and marked wrong. Position is the attempt's
   * own numbering, so nothing outside the attempt can move it.
   *
   * Optional so a submission from an older tab still marks the way it did.
   */
  position?: number;
  answer: string;
}

/** Per-question review, only ever sent back after the whole test is submitted. */
export interface QuestionReview {
  questionId: string;
  prompt: string;
  topicId: string;
  options: string[];
  imageUrl: string | null;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  /** Marks awarded, between 0 and `marks`. */
  score: number;
  /** Marks the question was worth when it was served. */
  marks: number;
  explanation: string;
}

/**
 * How a topic went, in marks rather than questions answered.
 *
 * Counting questions would let the bars disagree with the score above them:
 * three one-mark questions right out of four looks like 75%, while the same
 * attempt missing a four-mark question is 3/7.
 */
export interface TopicPerformance {
  topicId: string;
  score: number;
  marks: number;
}

/** How this attempt compares to the previous best. */
export interface AttemptComparison {
  isPersonalBest: boolean;
  previousBest: {
    score: number;
    totalMarks: number;
    totalQuestions: number;
    percentage: number;
    difficultyMode: DifficultyMode;
    takenAt: string;
  } | null;
}

export interface TestResult {
  attemptId: string;
  /** Marks earned, not questions answered correctly. */
  score: number;
  /** Marks available across the paper: the denominator for `percentage`. */
  totalMarks: number;
  totalQuestions: number;
  percentage: number;
  correctAnswers: number;
  incorrectAnswers: number;
  timeTakenSeconds: number;
  topicBreakdown: TopicPerformance[];
  reviews: QuestionReview[];
  comparison: AttemptComparison;
}

/** A row on the history page. */
export interface AttemptSummary {
  id: string;
  subjectId: string;
  topicIds: string[];
  difficultyMode: DifficultyMode;
  /** Marks earned, not questions answered correctly. */
  score: number;
  totalMarks: number;
  totalQuestions: number;
  percentage: number;
  timeTakenSeconds: number;
  submittedAt: string;
  /**
   * How each topic on the paper went, which is what lets the builder show a
   * student their last score on every topic.
   *
   * Optional so a history row from an API that predates it still reads.
   */
  topicBreakdown?: TopicPerformance[];
}

/**
 * Ranks an attempt for "best test so far".
 *
 * Raw percentage alone would let a 10/10 easy test beat 45/50 hard, so weight
 * by difficulty and by how long the test was.
 */
export const difficultyWeight: Record<DifficultyMode, number> = {
  easy: 1,
  custom: 1.1,
  medium: 1.25,
  hard: 1.5
};

export function attemptScoreValue(attempt: {
  percentage: number;
  totalQuestions: number;
  difficultyMode: DifficultyMode;
}): number {
  const lengthFactor = 1 + Math.min(attempt.totalQuestions, 50) / 100;
  return attempt.percentage * difficultyWeight[attempt.difficultyMode] * lengthFactor;
}

/**
 * Starter subjects and topics.
 *
 * Topics are still being confirmed against the real past papers, so the API
 * merges these with whatever topics actually exist in the question bank. New
 * topics then appear in the UI as soon as they are entered, with no code change.
 */
export const subjects: Subject[] = [
  {
    id: "math",
    name: "Mathematics",
    topics: [
      { id: "algebra", name: "Algebra" },
      { id: "geometry", name: "Geometry" },
      { id: "functions", name: "Functions and Graphs" },
      { id: "probability", name: "Probability and Statistics" }
    ]
  },
  {
    id: "english",
    name: "English",
    topics: [
      { id: "grammar", name: "Grammar" },
      { id: "vocabulary", name: "Vocabulary" },
      { id: "reading", name: "Reading Comprehension" },
      { id: "writing", name: "Writing" }
    ]
  },
  {
    id: "russian",
    name: "Russian",
    topics: [
      { id: "grammar", name: "Grammar" },
      { id: "spelling", name: "Spelling" },
      { id: "punctuation", name: "Punctuation" },
      { id: "reading", name: "Reading Comprehension" }
    ]
  }
];

export function subjectName(subjectId: string): string {
  return subjects.find((subject) => subject.id === subjectId)?.name ?? subjectId;
}

export function topicName(subjectId: string, topicId: string): string {
  const subject = subjects.find((item) => item.id === subjectId);
  const topic = subject?.topics.find((item) => item.id === topicId);
  if (topic) return topic.name;
  // Topic came from the bank rather than the starter list; make the id readable.
  return topicId.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Short-answer marking is lenient about case and spacing, nothing more. */
export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
