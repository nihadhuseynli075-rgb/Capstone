import type {
  AttemptComparison,
  AttemptSummary,
  QuestionReview,
  SubmittedAnswer,
  TopicPerformance
} from "@grade9/shared";
import { attemptScoreValue, normalizeAnswer } from "@grade9/shared";
import type { AttemptQuestion } from "../repositories/attemptRepository";

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
  answers: Array<{ position: number; studentAnswer: string; isCorrect: boolean; score: number }>;
}

export function markAttempt(questions: AttemptQuestion[], submitted: SubmittedAnswer[]): MarkedAttempt {
  // Position first, id second.
  //
  // `question_id` on an attempt is set to null if that question is later deleted
  // from the bank, and an attempt in flight when an admin tidies up would then
  // have no id to match a submitted answer against: the answer was silently
  // dropped and the question marked wrong. Position belongs to the attempt and
  // nothing outside it can move, so it is the one that holds.
  const answerByPosition = new Map(
    submitted
      .filter((item) => typeof item.position === "number")
      .map((item) => [item.position as number, item.answer])
  );
  const answerByQuestion = new Map(submitted.map((item) => [item.questionId, item.answer]));

  const reviews: QuestionReview[] = [];
  const answers: MarkedAttempt["answers"] = [];
  const topics = new Map<string, TopicPerformance>();
  let correct = 0;
  let earned = 0;
  let available = 0;

  for (const question of questions) {
    // Unanswered, or an id that no longer resolves, both mean blank.
    const studentAnswer =
      answerByPosition.get(question.position) ??
      (question.questionId === null ? undefined : answerByQuestion.get(question.questionId)) ??
      "";
    const isCorrect = isAnswerCorrect(question, studentAnswer);

    // Marking is still all-or-nothing per question: an answer either matches or
    // it does not. What changed is what a match is worth. The marks come off the
    // attempt rather than the bank, so re-marking a question later cannot alter
    // a result already recorded.
    const score = isCorrect ? question.marks : 0;

    if (isCorrect) correct += 1;
    earned += score;
    available += question.marks;

    reviews.push({
      questionId: question.questionId ?? `position-${question.position}`,
      prompt: question.prompt,
      topicId: question.topicId,
      options: question.options,
      imageUrl: question.imageUrl,
      studentAnswer,
      correctAnswer: question.correctAnswer,
      isCorrect,
      score,
      marks: question.marks,
      explanation: question.explanation
    });

    answers.push({ position: question.position, studentAnswer, isCorrect, score });

    const topic = topics.get(question.topicId) ?? {
      topicId: question.topicId,
      score: 0,
      marks: 0
    };
    topic.marks += question.marks;
    topic.score += score;
    topics.set(question.topicId, topic);
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
    incorrectAnswers: totalQuestions - correct,
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
 */
export function compareToPrevious(
  current: { percentage: number; totalQuestions: number; difficultyMode: AttemptSummary["difficultyMode"] },
  history: AttemptSummary[]
): AttemptComparison {
  if (history.length === 0) {
    return { isPersonalBest: true, previousBest: null };
  }

  const best = history.reduce((leader, attempt) =>
    attemptScoreValue(attempt) > attemptScoreValue(leader) ? attempt : leader
  );

  return {
    isPersonalBest: attemptScoreValue(current) >= attemptScoreValue(best),
    previousBest: {
      score: best.score,
      totalMarks: best.totalMarks,
      totalQuestions: best.totalQuestions,
      percentage: best.percentage,
      difficultyMode: best.difficultyMode,
      takenAt: best.submittedAt
    }
  };
}
