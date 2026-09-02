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
  score: number;
  totalQuestions: number;
  percentage: number;
  correctAnswers: number;
  incorrectAnswers: number;
  reviews: QuestionReview[];
  topicBreakdown: TopicPerformance[];
  answers: Array<{ position: number; studentAnswer: string; isCorrect: boolean }>;
}

export function markAttempt(questions: AttemptQuestion[], submitted: SubmittedAnswer[]): MarkedAttempt {
  const answerByQuestion = new Map(submitted.map((item) => [item.questionId, item.answer]));

  const reviews: QuestionReview[] = [];
  const answers: MarkedAttempt["answers"] = [];
  const topics = new Map<string, TopicPerformance>();
  let correct = 0;

  for (const question of questions) {
    // Attempt questions are keyed by their bank id; unanswered means blank.
    const studentAnswer = answerByQuestion.get(question.questionId ?? "") ?? "";
    const isCorrect = isAnswerCorrect(question, studentAnswer);
    if (isCorrect) correct += 1;

    reviews.push({
      questionId: question.questionId ?? `position-${question.position}`,
      prompt: question.prompt,
      topicId: question.topicId,
      options: question.options,
      imageUrl: question.imageUrl,
      studentAnswer,
      correctAnswer: question.correctAnswer,
      isCorrect,
      explanation: question.explanation
    });

    answers.push({ position: question.position, studentAnswer, isCorrect });

    const topic = topics.get(question.topicId) ?? {
      topicId: question.topicId,
      correctAnswers: 0,
      totalQuestions: 0
    };
    topic.totalQuestions += 1;
    if (isCorrect) topic.correctAnswers += 1;
    topics.set(question.topicId, topic);
  }

  const totalQuestions = questions.length;
  const percentage = totalQuestions === 0 ? 0 : Math.round((correct / totalQuestions) * 1000) / 10;

  return {
    score: correct,
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
      totalQuestions: best.totalQuestions,
      percentage: best.percentage,
      difficultyMode: best.difficultyMode,
      takenAt: best.submittedAt
    }
  };
}
