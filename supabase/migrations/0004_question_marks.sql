-- Exampeak: marks per question.
--
-- Run this in the Supabase SQL editor after 0003_attempt_links.sql.
--
-- Until now every question was worth the same, so a score was simply a count of
-- correct answers and a percentage was that count over the number of questions.
-- Real past papers do not work that way: a question ends "[3 marks]", and a
-- three-mark question earned should count for three times one worth a single
-- mark.
--
-- ---------------------------------------------------------------------------
-- Why this migration changes nothing on its own
-- ---------------------------------------------------------------------------
-- `marks` defaults to 1. Every question already in the bank therefore becomes a
-- one-mark question, which is exactly what the app has been assuming all along.
-- That makes the backfills below exact rather than approximate:
--
--   * an old attempt's `score` was a count of correct answers, and with every
--     question worth one mark that count already is the marks earned;
--   * an old attempt's `total_questions` was the denominator, and with every
--     question worth one mark that already is the total marks available.
--
-- So no existing percentage moves, and no result is retrospectively rewritten.
-- The columns only start to matter once a question is entered worth more than
-- one mark.

-- ---------------------------------------------------------------------------
-- 1. What a question is worth
-- ---------------------------------------------------------------------------

alter table questions
  add column if not exists marks int not null default 1;

-- A question worth nothing cannot be marked, and a negative one would let a
-- student lose marks by answering correctly. Guarded rather than declared
-- inline so this migration can be run twice without failing.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'questions_marks_positive'
  ) then
    alter table questions
      add constraint questions_marks_positive check (marks > 0);
  end if;
end $$;

comment on column questions.marks is
  'What this question is worth, as printed on the paper. Defaults to 1.';

-- ---------------------------------------------------------------------------
-- 2. Marks as they stood when the question was served
-- ---------------------------------------------------------------------------
-- Copied onto the attempt for the same reason the prompt and the answer are:
-- an admin re-marking a question from 1 to 3 next term must not silently change
-- what somebody scored last term. `marks` keeps the name it has on `questions`,
-- matching every other column copied across.

alter table attempt_questions
  add column if not exists marks int not null default 1;

-- Marks awarded for this answer. Nullable in the same way `is_correct` is: an
-- attempt that has been started but not submitted has neither.
alter table attempt_questions
  add column if not exists score int;

-- `is_correct` stays. It is still what the marker actually decides and what the
-- review screen puts a Correct or Wrong badge on; `score` is what that decision
-- is worth. Today one follows from the other, and the day a question can be
-- half right -- a two-part answer, one part correct -- only `score` can say so.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attempt_questions_score_within_marks'
  ) then
    alter table attempt_questions
      add constraint attempt_questions_score_within_marks
      check (score is null or (score >= 0 and score <= marks));
  end if;
end $$;

-- Every answer already marked: full marks if it was right, nothing if it was
-- not. With `marks` defaulting to 1 this reproduces the old scoring exactly.
update attempt_questions
set score = case when is_correct then marks else 0 end
where score is null
  and is_correct is not null;

comment on column attempt_questions.marks is
  'The marks this question was worth when it was served, copied from questions.';
comment on column attempt_questions.score is
  'Marks awarded, between 0 and marks. Null until the attempt is submitted.';

-- ---------------------------------------------------------------------------
-- 3. The denominator for an attempt
-- ---------------------------------------------------------------------------
-- `score` on an attempt becomes marks earned rather than questions right, and
-- `percentage` becomes score over total_marks. `total_questions` stays: it is
-- still what the history page means by "18/20", and it is no longer the same
-- number as the marks once questions are worth more than one.

alter table test_attempts
  add column if not exists total_marks int;

update test_attempts
set total_marks = total_questions
where total_marks is null;

comment on column test_attempts.total_marks is
  'Marks available across the whole attempt. The denominator for percentage.';

-- ---------------------------------------------------------------------------
-- What still has to change in the app
-- ---------------------------------------------------------------------------
-- This migration is deliberately inert on its own: nothing reads `marks` yet,
-- so every question stays worth 1 and every percentage is unchanged. Making it
-- count means, in one pass:
--
--   * `marks` on BankQuestion and QuestionDraft in packages/shared;
--   * the admin question form, and the zod schema in routes/admin.ts;
--   * a `marks` column in the spreadsheet importer's header aliases, and in
--     docs/question-format.md, so Nihad's sheet can carry it;
--   * markAttempt in services/marking.ts summing marks rather than counting
--     answers, and dividing by the marks available rather than the question
--     count;
--   * the topic breakdown, which currently counts questions per topic and
--     would want marks per topic to stay consistent with the headline score.
