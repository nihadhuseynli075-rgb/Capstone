import type {
  AttemptComparison,
  AttemptSummary,
  QuestionReview,
  SubmittedAnswer,
  TopicPerformance
} from "@grade9/shared";
import { attemptScoreValue, normalizeAnswer } from "@grade9/shared";
import type { AttemptQuestion } from "../repositories/attemptRepository";
import type { WrittenMark } from "./writtenMarking";

/**
 * Marks one answer.
 *
 * Multiple choice has to match exactly, since the student picked from a list.
 * Short answer ignores case and extra spacing but nothing more; anything
 * cleverer risks marking a wrong answer correct.
 */
export function isAnswerCorrect(question: AttemptQuestion, answer: string): boolean {
  if (answer.trim().length === 0) return false;

  if (question.type === "multiple-choice") {
    return answer === question.correctAnswer;
  }

  return normalizeAnswer(answer) === normalizeAnswer(question.correctAnswer);
}

export interface MarkedAttempt {
  /** Marks earned across the paper. */
  score: number;
  /** Marks available across the paper. */
  totalMarks: number;
  totalQuestions: number;
  percentage: number;
  correctAnswers: number;
  incorrectAnswers: number;
  reviews: QuestionReview[];
  topicBreakdown: TopicPerformance[];
  /**
   * What gets stored per question. A written answer that could not be marked
   * has a null score and a null isCorrect: it is not wrong, it is not counted.
   */
  answers: Array<{
    position: number;
    studentAnswer: string;
    isCorrect: boolean | null;
    score: number | null;
    feedback: string | null;
  }>;
}

/**
 * Each question's submitted answer, by position. Unanswered is blank.
 *
 * Position first, id second. `question_id` on an attempt is set to null if
 * that question is later deleted from the bank, and an attempt in flight when
 * an admin tidies up would then have no id to match a submitted answer
 * against: the answer was silently dropped and the question marked wrong.
 * Position belongs to the attempt and nothing outside it can move, so it is
 * the one that holds.
 */
export function resolveAnswers(questions: AttemptQuestion[], submitted: SubmittedAnswer[]): Map<number, string> {
  const answerByPosition = new Map(
    submitted
      .filter((item) => typeof item.position === "number")
      .map((item) => [item.position as number, item.answer])
  );
  const answerByQuestion = new Map(submitted.map((item) => [item.questionId, item.answer]));

  return new Map(
    questions.map((question) => [
      question.position,
      answerByPosition.get(question.position) ??
        (question.questionId === null ? undefined : answerByQuestion.get(question.questionId)) ??
        ""
    ])
  );
}

/** The parts of a question's review that do not depend on how it was marked. */
function reviewOf(question: AttemptQuestion, studentAnswer: string) {
  return {
    questionId: question.questionId ?? `position-${question.position}`,
    prompt: question.prompt,
    topicId: question.topicId,
    options: question.options,
    imageUrl: question.imageUrl,
    studentAnswer,
    correctAnswer: question.correctAnswer,
    marks: question.marks,
    explanation: question.explanation,
    type: question.type as QuestionReview["type"]
  };
}

function addToTopic(topics: Map<string, TopicPerformance>, question: AttemptQuestion, score: number) {
  const topic = topics.get(question.topicId) ?? { topicId: question.topicId, score: 0, marks: 0 };
  topic.marks += question.marks;
  topic.score += score;
  topics.set(question.topicId, topic);
}

/**
 * Marks a submitted paper.
 *
 * `written` carries the AI marker's verdicts on open-ended answers, by
 * position; every other type is marked here by exact match. A written answer
 * with no verdict, or an unmarked one, is left out of the total.
 */
export function markAttempt(
  questions: AttemptQuestion[],
  submitted: SubmittedAnswer[],
  written: Map<number, WrittenMark> = new Map()
): MarkedAttempt {
  const answerFor = resolveAnswers(questions, submitted);

  const reviews: QuestionReview[] = [];
  const answers: MarkedAttempt["answers"] = [];
  const topics = new Map<string, TopicPerformance>();
  let correct = 0;
  let incorrect = 0;
  let earned = 0;
  let available = 0;

  for (const question of questions) {
    // Unanswered, or an id that no longer resolves, both mean blank.
    const studentAnswer = answerFor.get(question.position) ?? "";

    if (question.type === "open-ended") {
      const verdict = written.get(question.position);

      if (!verdict || verdict.status === "unmarked") {
        // Not the student's fault, so not counted against them: left out of
        // the marks available, and of the topic's bar.
        reviews.push({
          ...reviewOf(question, studentAnswer),
          isCorrect: false,
          score: 0,
          feedback: null,
          counted: false
        });
        answers.push({ position: question.position, studentAnswer, isCorrect: null, score: null, feedback: null });
        continue;
      }

      // Partial marks are the point of a written question. "Correct" means
      // full marks, the way the results screen has always used it.
      const isCorrect = verdict.score === question.marks;
      if (isCorrect) correct += 1;
      else incorrect += 1;
      earned += verdict.score;
      available += question.marks;

      const feedback = verdict.feedback.length > 0 ? verdict.feedback : null;
      reviews.push({ ...reviewOf(question, studentAnswer), isCorrect, score: verdict.score, feedback, counted: true });
      answers.push({ position: question.position, studentAnswer, isCorrect, score: verdict.score, feedback });
      addToTopic(topics, question, verdict.score);
      continue;
    }

    const isCorrect = isAnswerCorrect(question, studentAnswer);

    // Marking is still all-or-nothing per question: an answer either matches or
    // it does not. What changed is what a match is worth. The marks come off the
    // attempt rather than the bank, so re-marking a question later cannot alter
    // a result already recorded.
    const score = isCorrect ? question.marks : 0;

    if (isCorrect) correct += 1;
    else incorrect += 1;
    earned += score;
    available += question.marks;

    reviews.push({ ...reviewOf(question, studentAnswer), isCorrect, score });
    answers.push({ position: question.position, studentAnswer, isCorrect, score, feedback: null });
    addToTopic(topics, question, score);
  }

  const totalQuestions = questions.length;
  // Out of the marks available, not the number of questions. A paper of ten
  // one-mark questions gives the same figure as before; one with a three-mark
  // question in it does not, which is the point.
  const percentage = available === 0 ? 0 : Math.round((earned / available) * 1000) / 10;

  return {
    score: earned,
    totalMarks: available,
    totalQuestions,
    percentage,
    correctAnswers: correct,
    // Not totalQuestions - correct: an unmarked written answer is neither.
    incorrectAnswers: incorrect,
    reviews,
    topicBreakdown: [...topics.values()],
    answers
  };
}

/**
 * Compares this attempt against the student's previous best.
 *
 * "Best" is not raw percentage: a 10/10 easy test should not outrank 45/50 hard,
 * so attempts are ranked by percentage weighted for difficulty and test length.
 *
 * Only beating the best is a new personal best. Equalling it used to count,
 * so a second identical 5/5 announced "New personal best. Your previous best
 * was 5/5." A tie is reported as `matchedBest` instead.
 */
export function compareToPrevious(
  current: { percentage: number; totalQuestions: number; difficultyMode: AttemptSummary["difficultyMode"] },
  history: AttemptSummary[]
): AttemptComparison {
  if (history.length === 0) {
    return { isPersonalBest: true, matchedBest: false, previousBest: null };
  }

  const best = history.reduce((leader, attempt) =>
    attemptScoreValue(attempt) > attemptScoreValue(leader) ? attempt : leader
  );

  const value = attemptScoreValue(current);
  const bestValue = attemptScoreValue(best);

  return {
    isPersonalBest: value > bestValue,
    matchedBest: value === bestValue,
    previousBest: {
      score: best.score,
      totalMarks: best.totalMarks,
      totalQuestions: best.totalQuestions,
      percentage: best.percentage,
      difficultyMode: best.difficultyMode,
      takenAt: best.submittedAt,
      subjectId: best.subjectId
    }
  };
}
