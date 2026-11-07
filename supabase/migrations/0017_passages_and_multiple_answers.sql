-- Exampeak: reading passages, and questions with more than one right answer.
--
-- Run this in the Supabase SQL editor after
-- 0016_definer_function_privileges.sql (or run all of run-all.sql, which now
-- ends with it). Nothing already in the bank changes: every question keeps
-- its type and answer, and has no passage until one is given it.
--
-- From the session with Nihad on 7 November 2026.
--
-- Every statement here is safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. Passages
-- ---------------------------------------------------------------------------
-- The Russian, English and Azerbaijani papers ask several questions about one
-- text (the Komodo dragon, «Приезд бабушки», ...). The text is kept once, here,
-- and each of its questions points at it. A test shows the text beside its
-- questions and serves them one after another, in `passage_order`, so a
-- student reads it once rather than going back to find it for each question.

create table if not exists passages (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null,
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  body text not null check (btrim(body) <> '' and char_length(body) <= 20000),
  paper_year int,
  source text,
  -- The passage's own id in the sheet it came from ("05-P1"), so importing
  -- the sheet again updates the same passage rather than adding a copy.
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table passages add column if not exists external_ref text;

create unique index if not exists passages_external_ref_key on passages (external_ref);

create index if not exists passages_subject_idx on passages (subject_id);

drop trigger if exists passages_set_updated_at on passages;
create trigger passages_set_updated_at
  before update on passages
  for each row
  execute function set_updated_at();

-- Like the question bank, only the API reads it (with the secret key, which
-- passes RLS). No policy for the public key at all.
alter table passages enable row level security;

comment on table passages is
  'Reading texts that several questions are about. Shown beside their questions in a test.';

-- Deleting a passage leaves its questions in the bank, with no passage.
alter table questions
  add column if not exists passage_id uuid references passages(id) on delete set null;

alter table questions
  add column if not exists passage_order int;

create index if not exists questions_passage_idx on questions (passage_id);

comment on column questions.passage_id is
  'The passage the question is about, or null. Questions on one passage are served together.';
comment on column questions.passage_order is
  'Where the question comes among its passage''s questions, 1 first. Null comes after the numbered ones.';

-- ---------------------------------------------------------------------------
-- 2. Questions with more than one right answer
-- ---------------------------------------------------------------------------
-- `multiple-select`: the student ticks every option that is right, and the
-- question is right only when exactly those are ticked. correct_answer holds
-- the right options' text as a JSON list, e.g. ["as", "because"].
--
-- questions_ready_is_complete (0008) only looks inside a `multiple-choice`
-- answer, so it already lets these through; the API checks that every
-- answer in the list is one of the options.

alter table questions
  drop constraint if exists questions_type_check;

alter table questions
  add constraint questions_type_check
  check (type in ('multiple-choice', 'multiple-select', 'short-answer', 'open-ended'));
