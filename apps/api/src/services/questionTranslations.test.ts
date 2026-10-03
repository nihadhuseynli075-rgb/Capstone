import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { followsSiteLanguage, translatableSubjects } from "@grade9/shared";
import type { BankQuestion } from "@grade9/shared";
import { markAttempt } from "./marking";
import { toAttemptQuestion } from "./mockTestGenerator";
import { localizeQuestion, readTranslations, translationProblems } from "./questionTranslations";

/**
 * A maths question with English as its own text and Russian as a translation,
 * which is how the maths bank is stored. Nothing under test cares which language
 * is the base, so a few tests below turn it round.
 */
function mathQuestion(overrides: Partial<BankQuestion> = {}): BankQuestion {
  return {
    id: "q-circle",
    subjectId: "math",
    topicId: "geometry",
    difficulty: "easy",
    type: "multiple-choice",
    prompt: "Find the radius of a circle whose circumference is 32π cm.",
    options: ["8 cm", "16 cm", "32 cm", "64 cm"],
    correctAnswer: "16 cm",
    marks: 1,
    explanation: "The circumference is 2πr, so r = 16.",
    imageUrl: null,
    paperYear: 2026,
    source: null,
    status: "ready",
    subtopic: null,
    translations: {
      ru: {
        prompt: "Найдите радиус окружности, длина которой равна 32π см.",
        options: ["8 см", "16 см", "32 см", "64 см"],
        explanation: "Длина окружности равна 2πr, поэтому r = 16."
      }
    },
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides
  };
}

/** Serves a question the way the generator does, then marks one answer to it. */
function markServed(question: BankQuestion, language: "en" | "ru" | "az" | undefined, answer: string) {
  const served = toAttemptQuestion(localizeQuestion(question, language), 0);
  const result = markAttempt([served], [{ questionId: question.id, position: 0, answer }]);
  return { served, result };
}

describe("which subjects follow the site language", () => {
  test("only maths does", () => {
    assert.deepEqual([...translatableSubjects], ["math"]);
    assert.equal(followsSiteLanguage("math"), true);
    assert.equal(followsSiteLanguage("english"), false);
    assert.equal(followsSiteLanguage("russian"), false);
  });
});

describe("localizeQuestion", () => {
  test("a Russian student gets the Russian text, options and explanation", () => {
    const served = localizeQuestion(mathQuestion(), "ru");

    assert.equal(served.prompt, "Найдите радиус окружности, длина которой равна 32π см.");
    assert.deepEqual(served.options, ["8 см", "16 см", "32 см", "64 см"]);
    assert.equal(served.explanation, "Длина окружности равна 2πr, поэтому r = 16.");
  });

  test("the correct option follows its position into the translated list", () => {
    assert.equal(localizeQuestion(mathQuestion(), "ru").correctAnswer, "16 см");
  });

  test("a language with no translation gets the question's own text", () => {
    const question = mathQuestion();

    // English has no entry because English is the text itself, and Azerbaijani
    // has none yet.
    assert.equal(localizeQuestion(question, "en"), question);
    assert.equal(localizeQuestion(question, "az"), question);
    assert.equal(localizeQuestion(question, undefined), question);
  });

  test("does not care which language the question's own text is in", () => {
    // The same question the other way round: Russian is the base, English the
    // translation.
    const russianBase = mathQuestion({
      prompt: "Найдите радиус окружности, длина которой равна 32π см.",
      options: ["8 см", "16 см", "32 см", "64 см"],
      correctAnswer: "16 см",
      translations: {
        en: { prompt: "Find the radius of a circle whose circumference is 32π cm.", options: ["8 cm", "16 cm", "32 cm", "64 cm"] }
      }
    });

    assert.equal(localizeQuestion(russianBase, "en").correctAnswer, "16 cm");
    assert.equal(localizeQuestion(russianBase, "ru"), russianBase);
  });

  test("a translation without options keeps the question's options as they are", () => {
    const served = localizeQuestion(
      mathQuestion({ translations: { ru: { prompt: "Найдите радиус окружности." } } }),
      "ru"
    );

    assert.equal(served.prompt, "Найдите радиус окружности.");
    assert.deepEqual(served.options, ["8 cm", "16 cm", "32 cm", "64 cm"]);
    assert.equal(served.correctAnswer, "16 cm");
    assert.equal(served.explanation, "The circumference is 2πr, so r = 16.");
  });

  test("English and Russian questions are never swapped, even with translations on them", () => {
    for (const subjectId of ["english", "russian"]) {
      const question = mathQuestion({ subjectId });

      assert.equal(localizeQuestion(question, "ru"), question);
      assert.equal(localizeQuestion(question, "en"), question);
    }
  });

  test("a translation whose options do not line up is skipped, not half used", () => {
    const question = mathQuestion({
      translations: { ru: { prompt: "Найдите радиус.", options: ["8 см", "16 см", "32 см"] } }
    });

    assert.equal(localizeQuestion(question, "ru"), question);
  });

  test("a translation that makes the right option ambiguous is skipped", () => {
    const question = mathQuestion({
      translations: { ru: { prompt: "Найдите радиус.", options: ["8 см", "16 см", "16 см", "64 см"] } }
    });

    assert.equal(localizeQuestion(question, "ru"), question);
  });

  test("a short answer takes the translation's wording of the answer", () => {
    const short = mathQuestion({
      type: "short-answer",
      options: [],
      correctAnswer: "26 cm",
      translations: { ru: { prompt: "Найдите периметр.", correctAnswer: "26 см" } }
    });

    assert.equal(localizeQuestion(short, "ru").correctAnswer, "26 см");
    assert.equal(localizeQuestion(short, "en").correctAnswer, "26 cm");
  });

  test("a short answer with no translated wording keeps the original", () => {
    const short = mathQuestion({
      type: "short-answer",
      options: [],
      correctAnswer: "26",
      translations: { ru: { prompt: "Найдите периметр." } }
    });

    assert.equal(localizeQuestion(short, "ru").correctAnswer, "26");
  });

  test("a written question keeps its marking guide whatever a translation says", () => {
    const written = mathQuestion({
      type: "open-ended",
      options: [],
      correctAnswer: "1 mark: subtracts 6 from both sides.",
      translations: { ru: { prompt: "Объясните решение.", correctAnswer: "Другое руководство." } }
    });

    const served = localizeQuestion(written, "ru");
    assert.equal(served.prompt, "Объясните решение.");
    assert.equal(served.correctAnswer, "1 mark: subtracts 6 from both sides.");
  });
});

describe("marking a translated question", () => {
  test("maths in Russian and in English marks the same choice as correct", () => {
    const question = mathQuestion();
    const correctPosition = question.options.indexOf(question.correctAnswer);

    for (const language of ["ru", "en"] as const) {
      const { served } = markServed(question, language, "");
      const answer = served.options[correctPosition];
      const { result } = markServed(question, language, answer);

      assert.equal(result.score, 1, `${language}: the option at the original's position is right`);
      assert.equal(result.reviews[0].isCorrect, true);
    }
  });

  test("every other option is wrong in both languages", () => {
    const question = mathQuestion();

    for (const language of ["ru", "en"] as const) {
      const { served } = markServed(question, language, "");

      served.options.forEach((option, position) => {
        const { result } = markServed(question, language, option);
        assert.equal(result.reviews[0].isCorrect, position === 1, `${language} option ${position}`);
      });
    }
  });

  test("the original's answer text is not an option on a Russian paper", () => {
    // Marking works from the copy taken when the paper was served, so the
    // English answer is just text the paper never offered.
    const { result } = markServed(mathQuestion(), "ru", "16 cm");
    assert.equal(result.score, 0);
  });

  test("the review shows the question as it was served", () => {
    const { result } = markServed(mathQuestion(), "ru", "16 см");
    const [review] = result.reviews;

    assert.equal(review.prompt, "Найдите радиус окружности, длина которой равна 32π см.");
    assert.deepEqual(review.options, ["8 см", "16 см", "32 см", "64 см"]);
    assert.equal(review.correctAnswer, "16 см");
    assert.equal(review.studentAnswer, "16 см");
    assert.equal(review.explanation, "Длина окружности равна 2πr, поэтому r = 16.");
  });

  test("editing the translation after a paper was served changes nothing on it", () => {
    const question = mathQuestion();
    const served = toAttemptQuestion(localizeQuestion(question, "ru"), 0);

    question.translations.ru = { prompt: "Изменено.", options: ["a", "b", "c", "d"] };

    const result = markAttempt([served], [{ questionId: question.id, position: 0, answer: "16 см" }]);
    assert.equal(result.score, 1);
    assert.equal(result.reviews[0].prompt, "Найдите радиус окружности, длина которой равна 32π см.");
  });

  test("an English question is the same on a Russian paper as on an English one", () => {
    const english = mathQuestion({ subjectId: "english", topicId: "grammar" });

    const inRussian = markServed(english, "ru", "16 cm");
    const inEnglish = markServed(english, "en", "16 cm");

    assert.deepEqual(inRussian.served, inEnglish.served);
    assert.equal(inRussian.served.prompt, english.prompt);
    assert.equal(inRussian.result.score, 1);
  });

  test("a missing translation marks against the original", () => {
    const { served, result } = markServed(mathQuestion(), "az", "16 cm");

    assert.equal(served.prompt, "Find the radius of a circle whose circumference is 32π cm.");
    assert.equal(result.score, 1);
  });

  test("a translated short answer is marked against the translated wording", () => {
    const short = mathQuestion({
      type: "short-answer",
      options: [],
      correctAnswer: "26 cm",
      translations: { ru: { prompt: "Найдите периметр.", correctAnswer: "26 см" } }
    });

    assert.equal(markServed(short, "ru", "26 см").result.score, 1);
    assert.equal(markServed(short, "ru", "26 cm").result.score, 0);
    assert.equal(markServed(short, "en", "26 cm").result.score, 1);
  });
});

describe("readTranslations", () => {
  test("reads the shape the column is documented to hold", () => {
    const raw = {
      ru: { prompt: "Вопрос", options: ["а", "б"], explanation: "Потому что", correctAnswer: "а" }
    };

    assert.deepEqual(readTranslations(raw), raw);
  });

  test("anything that is not an object of entries reads as no translations", () => {
    for (const raw of [null, undefined, "ru", 3, [], [{ prompt: "x" }]]) {
      assert.deepEqual(readTranslations(raw), {});
    }
  });

  test("leaves out languages the site does not have, and entries with no text", () => {
    const read = readTranslations({
      ru: { prompt: "Вопрос" },
      de: { prompt: "Frage" },
      az: { prompt: "   " },
      en: "not an object"
    });

    assert.deepEqual(read, { ru: { prompt: "Вопрос" } });
  });

  test("skips an entry whose options are not a list of strings, rather than half using it", () => {
    assert.deepEqual(readTranslations({ ru: { prompt: "Вопрос", options: [1, 2, 3] } }), {});
    assert.deepEqual(readTranslations({ ru: { prompt: "Вопрос", options: "а, б" } }), {});
  });

  test("ignores fields of the wrong type but keeps the entry", () => {
    assert.deepEqual(readTranslations({ ru: { prompt: "Вопрос", explanation: 5, correctAnswer: null } }), {
      ru: { prompt: "Вопрос" }
    });
  });
});

describe("translationProblems", () => {
  test("a translation that fits has none", () => {
    assert.deepEqual(translationProblems(mathQuestion()), []);
    assert.deepEqual(translationProblems(mathQuestion({ translations: {} })), []);
  });

  test("options have to be one for one with the question's", () => {
    const [problem] = translationProblems(
      mathQuestion({ translations: { ru: { prompt: "Вопрос", options: ["а", "б"] } } })
    );

    assert.deepEqual(problem.path, ["translations", "ru", "options"]);
    assert.match(problem.message, /Russian translation has 2 options but the question has 4/);
  });

  test("an empty translated option is refused", () => {
    const problems = translationProblems(
      mathQuestion({ translations: { ru: { prompt: "Вопрос", options: ["а", "", "в", "г"] } } })
    );

    assert.match(problems[0].message, /empty option/);
  });

  test("only subjects that follow the site language may have translations", () => {
    const [problem] = translationProblems(mathQuestion({ subjectId: "russian" }));

    assert.deepEqual(problem.path, ["translations"]);
    assert.match(problem.message, /Russian questions are always shown in one language/);
  });

  test("a multiple choice question has no separate translated answer", () => {
    const [problem] = translationProblems(
      mathQuestion({ translations: { ru: { prompt: "Вопрос", correctAnswer: "16 см" } } })
    );

    assert.deepEqual(problem.path, ["translations", "ru", "correctAnswer"]);
  });

  test("only a multiple choice question has translated options", () => {
    const [problem] = translationProblems(
      mathQuestion({
        type: "short-answer",
        options: [],
        correctAnswer: "26",
        translations: { en: { prompt: "Perimeter?", options: ["26"] } }
      })
    );

    assert.deepEqual(problem.path, ["translations", "en", "options"]);
  });

  test("a translated short answer is fine", () => {
    assert.deepEqual(
      translationProblems(
        mathQuestion({
          type: "short-answer",
          options: [],
          correctAnswer: "26 cm",
          translations: { ru: { prompt: "Периметр?", correctAnswer: "26 см" } }
        })
      ),
      []
    );
  });
});
