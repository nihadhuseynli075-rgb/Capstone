/**
 * Shared contracts between the ExamPeak web app and API.
 *
 * Everything both sides need to agree on lives here: subjects, the difficulty
 * model, the question-bank record, and the result shapes.
 */

export type SubjectId = "math" | "english" | "russian";

/** The languages the site is offered in, which is also the languages a question can be translated into. */
export const siteLanguages = ["en", "ru", "az"] as const;

export type SiteLanguage = (typeof siteLanguages)[number];

export function isSiteLanguage(value: unknown): value is SiteLanguage {
  return typeof value === "string" && (siteLanguages as readonly string[]).includes(value);
}

/**
 * The subjects whose questions follow the language the student chose for the site.
 *
 * English questions are always in English and Russian ones always in Russian,
 * because reading the language is the thing being tested. Maths is the only
 * subject where the language is just the wrapper around the problem.
 *
 * This is the one place that says so. Serving, the admin form and the importer
 * all ask here, so a translation added to an English or Russian question by
 * mistake (or by a seed script) is never served in place of the real text.
 */
export const translatableSubjects: readonly SubjectId[] = ["math"];

export function followsSiteLanguage(subjectId: string): boolean {
  return (translatableSubjects as readonly string[]).includes(subjectId);
}

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

/**
 * How a question is answered, and so how it is marked.
 *
 * `open-ended` is a written answer (a paragraph, a short essay, an explanation)
 * with no single right wording. It is marked by an AI marker against the
 * question's marking guide, which lives where other types keep their answer.
 */
export type QuestionType = "multiple-choice" | "short-answer" | "open-ended";

/** The longest written answer accepted, so a paste cannot run up the marking bill. */
export const writtenAnswerMaxLength = 4000;

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
 * How a difficulty and a question type are written for people: the builder's
 * own words. Printing the ids and leaving the stylesheet to capitalise them
 * also capitalised every word around them, so "Probability and Statistics"
 * came out as "Probability And Statistics".
 */
export const difficultyNames: Record<DifficultyMode, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  custom: "Custom"
};

export const questionTypeNames: Record<QuestionType, string> = {
  "multiple-choice": "Multiple choice",
  "short-answer": "Short answer",
  "open-ended": "Written answer"
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
 * Characters that draw nothing: format characters (zero-width spaces and
 * joiners, direction marks, soft hyphens) and the Hangul fillers, which
 * Unicode counts as letters although they are blank. trim() keeps all of
 * them, so a name made only of these was saved and showed as nothing in the
 * header and on a friend's list.
 */
const INVISIBLE_IN_NAMES = /[\p{Cf}ᅟᅠㅤﾠ]/gu;

/**
 * A name as it is kept and shown: invisible characters taken out, any run of
 * spaces, tabs or line breaks made one space, and the ends trimmed. The form,
 * the API and the friends list all clean a name this way, so they agree.
 */
export function cleanName(value: string): string {
  return value.replace(INVISIBLE_IN_NAMES, "").replace(/\s+/g, " ").trim();
}

/** Whether a cleaned name has anything to read in it: at least one letter or digit. */
export function isReadableName(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}

export * from "./usernames";
export * from "./sessionOwner";
export * from "./topics";

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
  /**
   * What friends find this student by, always lowercase and always present:
   * the database makes one at sign-up. The rules are in usernames.ts.
   */
  username: string;
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
 * One language's version of a question's text.
 *
 * `options` is in the same order as the question's own options, which is what
 * lets the right one be found by position rather than by comparing text across
 * languages. Leave it out and the question's own options are used as they are.
 * `correctAnswer` is only for a short answer whose wording differs by language
 * ("26 cm" and "26 см"); a multiple choice answer is the option in the same
 * position as the original.
 */
export interface QuestionTranslation {
  prompt: string;
  options?: string[];
  explanation?: string;
  correctAnswer?: string;
}

/** Keyed by site language. A language with no entry is shown in the question's own text. */
export type QuestionTranslations = Partial<Record<SiteLanguage, QuestionTranslation>>;

/**
 * A question as stored in the bank, entered through the admin dashboard.
 *
 * `correctAnswer` always holds the answer text, never the letter. Imports that
 * supply a letter are resolved to the matching option on the way in, which
 * keeps marking and review rendering to a single simple comparison.
 *
 * The prompt, options, explanation and answer are the question as first
 * written, in whatever language that was; `translations` holds the others. The
 * text here is what is shown when there is no translation to use, and what the
 * rest of the app treats as the question itself.
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
  /** Only a ready question is ever put in front of a student. */
  status: QuestionStatus;
  /** The paper's own subtopic label, set when a paper is loaded from its sheet. */
  subtopic: string | null;
  /** Only used for subjects that follow the site language; see `followsSiteLanguage`. */
  translations: QuestionTranslations;
  createdAt: string;
  updatedAt: string;
}

/**
 * Where a question is on its way into tests.
 *
 * Papers are loaded in stages, questions first and options and diagrams later,
 * so the bank holds questions nobody can answer yet. `draft` is waiting for its
 * options or answer, `image-pending` for its diagram.
 */
export type QuestionStatus = "draft" | "image-pending" | "ready";

/**
 * The fields the admin dashboard actually submits.
 *
 * Status is not one of them: a question saved through the form has passed the
 * form's checks, so saving it is what makes it ready.
 */
export type QuestionDraft = Omit<BankQuestion, "id" | "createdAt" | "updatedAt" | "status" | "subtopic">;

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
  /** Optional so a review from an API that predates it still reads. */
  type?: QuestionType;
  /** The marker's feedback on a written answer. Absent for other types. */
  feedback?: string | null;
  /**
   * False when a written answer could not be marked, so the question was left
   * out of the score rather than counted as wrong. Absent means counted.
   */
  counted?: boolean;
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
  /** Better than every earlier attempt, or the first one. A tie is not a new best. */
  isPersonalBest: boolean;
  /**
   * Exactly level with the best earlier attempt. Optional because a result
   * saved in the browser before this existed does not have it.
   */
  matchedBest?: boolean;
  previousBest: {
    score: number;
    totalMarks: number;
    totalQuestions: number;
    percentage: number;
    difficultyMode: DifficultyMode;
    takenAt: string;
    /** The best can be in another subject; optional for the same reason as matchedBest. */
    subjectId?: string;
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
 * What one student can see of another: a name, a username and a photo, and
 * nothing else.
 *
 * Deliberately no email. Adding a friend can start from an email address, but
 * nothing here ever hands one back out, so the friends list cannot be used to
 * collect the addresses of everybody who has an account. The username is the
 * part of an account that is meant to be shared.
 */
export interface FriendPerson {
  id: string;
  fullName: string;
  /** Lowercase, without the "@" the app prints before it. */
  username: string;
  /** Null when there is no photo, and the app shows initials instead. */
  avatarUrl: string | null;
}

/**
 * How a student has done on their mock tests, for comparing with a friend.
 *
 * Built from submitted tests only, the same ones the history page lists. It is
 * a handful of headline figures on purpose: it is not a ranking, and says
 * nothing about which topics anyone is weak at.
 */
export interface FriendProgress {
  testsTaken: number;
  /** The best test by the history page's own measure, or null before the first. */
  best: { score: number; totalMarks: number; percentage: number } | null;
  /** The mean percentage over every test, to one decimal place. */
  averagePercentage: number | null;
  /** When the latest test was handed in. */
  lastActiveAt: string | null;
}

export interface Friend extends FriendPerson {
  /** The friendship's own id, which is what removing it is asked by. */
  friendshipId: string;
  /** When the request was accepted. */
  since: string;
  progress: FriendProgress;
}

/** A pending request, from either side: the person is the one at the other end. */
export interface FriendRequest extends FriendPerson {
  requestId: string;
  sentAt: string;
}

/** Everything the friends page shows, in one read. */
export interface FriendsOverview {
  /** The signed-in student's own figures, so each friend can be set beside them. */
  me: FriendProgress;
  friends: Friend[];
  /** Asked of me, waiting for my answer. */
  incoming: FriendRequest[];
  /** Asked by me, waiting for theirs. */
  outgoing: FriendRequest[];
}

/**
 * What sending a request came to.
 *
 * "accepted" is when the other student had already asked: their request is
 * accepted instead of a second one being made, so the two end up friends.
 */
export interface SentFriendRequest {
  outcome: "requested" | "accepted";
  person: FriendPerson;
}

/**
 * Starter subjects and topics.
 *
 * Topics are still being confirmed against the real past papers, so the API
 * merges these with whatever topics actually exist in the question bank. New
 * topics then appear in the UI as soon as they are entered, with no code change.
 *
 * A topic missing from here still works, but its name is made from its id, and
 * "sets-logic" reads as "Sets Logic". So every topic the seeded bank uses is
 * named here (services/topics.test.ts in the API checks it against the seed).
 */
export const subjects: Subject[] = [
  {
    id: "math",
    name: "Mathematics",
    topics: [
      { id: "algebra", name: "Algebra" },
      { id: "geometry", name: "Geometry" },
      { id: "functions", name: "Functions and Graphs" },
      { id: "probability", name: "Probability and Statistics" },
      { id: "arithmetic", name: "Arithmetic" },
      { id: "number-theory", name: "Number Theory" },
      { id: "sets-logic", name: "Sets and Logic" },
      { id: "coordinate-geometry", name: "Coordinate Geometry" }
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
      { id: "reading", name: "Reading Comprehension" },
      { id: "phonetics", name: "Phonetics" },
      { id: "vocabulary", name: "Vocabulary" },
      { id: "writing", name: "Writing" }
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

/**
 * The first option a multiple choice question has twice, or null.
 *
 * Marking compares the text of the option picked, so two options that read
 * the same are both marked correct, or both wrong. The admin form, the API
 * and the spreadsheet import all refuse such a question for this reason.
 * Compared as written, apart from the ends: "x" and "X" can be different
 * answers in a maths question.
 */
export function repeatedOption(options: readonly string[]): string | null {
  const seen = new Set<string>();

  for (const option of options) {
    const text = option.trim();
    if (text.length === 0) continue;
    if (seen.has(text)) return text;
    seen.add(text);
  }

  return null;
}

/** Short-answer marking is lenient about case and spacing, nothing more. */
export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
