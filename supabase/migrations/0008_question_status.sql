-- Exampeak: questions that are in the bank but not ready to be asked.
--
-- Run this in the Supabase SQL editor after 0007_profiles_and_google.sql.
--
-- ---------------------------------------------------------------------------
-- Why a question can be unfinished
-- ---------------------------------------------------------------------------
-- The past papers arrive in stages. The question text, topic and difficulty
-- are typed up first; the answer options and the diagrams come later. Until
-- now a question was either in the bank, and so in every test drawn from it,
-- or not in the bank at all. Loading a paper early meant students meeting
-- multiple choice questions with no choices, and diagrams that were not there.
--
-- So a question now has a status, and only a `ready` one is ever put in front
-- of a student:
--
--   draft          typed up, still waiting for its options or its answer
--   image-pending  waiting for its diagram, shown to admins as "image coming soon"
--   ready          complete, and drawn into tests
--
-- Every existing question is `ready`, which is exactly how the app has treated
-- it so far, so nothing a student sees today changes.
--
-- Every statement here is safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. The status
-- ---------------------------------------------------------------------------

alter table questions
  add column if not exists status text not null default 'ready';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'questions_status_check'
  ) then
    alter table questions
      add constraint questions_status_check
      check (status in ('draft', 'image-pending', 'ready'));
  end if;
end $$;

-- A ready question has to be one that can be marked: an answer, and for
-- multiple choice at least two options with the answer among them. The API
-- already refuses anything less; this makes it true of rows written straight
-- from the SQL editor too, which is how papers are loaded.
--
-- `not valid` means rows already in the bank are not re-checked, only rows
-- written from now on. Every one of them came through the API's checks, but
-- one that somehow did not should not stop this whole migration.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'questions_ready_is_complete'
  ) then
    alter table questions
      add constraint questions_ready_is_complete
      check (
        status <> 'ready'
        or (
          btrim(correct_answer) <> ''
          and (
            type <> 'multiple-choice'
            or (jsonb_array_length(options) >= 2 and options ? correct_answer)
          )
        )
      ) not valid;
  end if;
end $$;

comment on column questions.status is
  'draft: waiting for options or answer. image-pending: waiting for its diagram. ready: drawn into tests. Only ready questions reach students.';

-- ---------------------------------------------------------------------------
-- 2. Where a question came from, precisely enough to update it
-- ---------------------------------------------------------------------------
-- A paper is loaded more than once: the questions first, the options and
-- answers later, the diagrams after that. Each load has to find the rows the
-- last one made rather than add a second copy, and prompt text is no key, since
-- it is one of the things a later load may correct.
--
-- `external_ref` names the paper and the question number, for example
-- 'dim-2026-04-12-variant-a:q57'. Questions added in the admin dashboard leave
-- it null; unique still allows any number of nulls.

alter table questions
  add column if not exists external_ref text;

create unique index if not exists questions_external_ref_key
  on questions (external_ref);

comment on column questions.external_ref is
  'Paper and question number, e.g. dim-2026-04-12-variant-a:q57. What a reloaded paper matches on. Null for questions added by hand.';

-- ---------------------------------------------------------------------------
-- 3. The subtopic
-- ---------------------------------------------------------------------------
-- Kept as the paper's own label ("Percentages", "Similar triangles"). Not used
-- to build tests yet, but it is on every row of the question sheet, and a
-- per-subtopic breakdown later needs it recorded now.

alter table questions
  add column if not exists subtopic text;

comment on column questions.subtopic is
  'The paper''s own subtopic label, e.g. "Percentages". Informational for now.';
