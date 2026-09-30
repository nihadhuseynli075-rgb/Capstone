-- Exampeak: written answers, marked by an AI marker.
--
-- Run this in the Supabase SQL editor after 0008_question_status.sql.
--
-- ---------------------------------------------------------------------------
-- What changes
-- ---------------------------------------------------------------------------
-- The past papers have questions no exact-match marking can handle: "write a
-- story from these pictures", "explain this expression in your own words".
-- These are `open-ended` questions. The student writes an answer, and an AI
-- marker acting as a Grade 9 teacher marks it against the question's marking
-- guide and says why.
--
-- The marking guide is kept in `correct_answer`, where the other types keep
-- their answer, so everything that copies a question onto an attempt already
-- carries it across. For an open-ended question 0008's rule "a ready question
-- has an answer" therefore reads "a ready question has a marking guide".
--
-- Every statement here is safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. The third question type
-- ---------------------------------------------------------------------------
-- 0001 declared the check inline, so Postgres named it questions_type_check.

alter table questions
  drop constraint if exists questions_type_check;

alter table questions
  add constraint questions_type_check
  check (type in ('multiple-choice', 'short-answer', 'open-ended'));

comment on column questions.correct_answer is
  'The answer text (never the option letter). For open-ended questions, the marking guide: what an answer needs for each mark.';

-- ---------------------------------------------------------------------------
-- 2. What the marker said
-- ---------------------------------------------------------------------------
-- Kept with the answer, so reopening a past result shows the same feedback
-- the student saw, without paying to mark the answer again.
--
-- A written answer the marker could not reach is left with a null score and
-- a null is_correct. Its marks are left out of the paper's total, so a marking
-- outage costs the student nothing rather than counting as a wrong answer.

alter table attempt_questions
  add column if not exists feedback text;

comment on column attempt_questions.feedback is
  'The marker''s feedback on an open-ended answer. Null for other types, and for an answer that could not be marked.';
