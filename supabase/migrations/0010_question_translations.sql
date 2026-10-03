-- Exampeak: questions that can be asked in the student's language.
--
-- Run this in the Supabase SQL editor after 0009_written_answers.sql.
--
-- ---------------------------------------------------------------------------
-- What changes
-- ---------------------------------------------------------------------------
-- The site is offered in English, Russian and Azerbaijani, and the maths paper
-- is the same paper whichever of them a student reads the site in. So a maths
-- question can now carry its text in more than one language, and a student is
-- given it in the language they chose for the site.
--
-- Only maths does this. English questions are always in English and Russian
-- questions always in Russian, because reading that language is the thing being
-- tested. Which subjects follow the site language is decided in the API
-- (translatableSubjects in packages/shared), not here, so this column is safe to
-- fill in on any question without ever changing what an English or Russian
-- question says.
--
-- The question's own columns (prompt, options, correct_answer, explanation)
-- stay the source of truth. They are the question as first written, in whatever
-- language that was, and they are what a student sees when there is no
-- translation in their language. Azerbaijani has none yet, so those students
-- get the question's own text.
--
-- Every statement here is safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. The translations
-- ---------------------------------------------------------------------------
-- One JSON object, keyed by language code:
--
--   {
--     "ru": {
--       "prompt":        "Найдите радиус окружности, длина которой равна 32π см.",
--       "options":       ["8 см", "16 см", "32 см", "64 см"],
--       "explanation":   "Длина окружности равна 2πr, поэтому r = 16.",
--       "correctAnswer": "16 см"
--     }
--   }
--
-- Only `prompt` is required. `options` is in the same order as the question's
-- own options: the correct option is found by its position, so nothing ever
-- compares text across languages, and a translation may word an option however
-- it likes. Leave `options` out and the question's own options are used as they
-- are. `correctAnswer` is for a short-answer question only, where the answer
-- itself reads differently in the other language ("26 cm" and "26 см"); a
-- multiple choice answer is just the option in the same position.
--
-- A question with no translations holds an empty object, not null, so the API
-- never has to ask whether there is anything to look inside.

alter table questions
  add column if not exists translations jsonb not null default '{}'::jsonb;

-- Only that the column holds an object. What is inside is checked by the API
-- when a question is saved and again when one is served, which skips a
-- translation that does not fit rather than failing the test.
alter table questions
  drop constraint if exists questions_translations_is_object;

alter table questions
  add constraint questions_translations_is_object
  check (jsonb_typeof(translations) = 'object');

comment on column questions.translations is
  'Other-language versions of the question, keyed by language code: {"ru": {"prompt", "options"?, "explanation"?, "correctAnswer"?}}. options is in the same order as options. Only subjects that follow the site language use it (maths). The columns on the question stay the source of truth and are shown when there is no translation in the student''s language.';
