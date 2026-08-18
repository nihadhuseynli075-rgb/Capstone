-- ExamPeak initial schema.
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
--
-- If you already ran the earlier starter schema against this project, uncomment
-- this block first to clear it out. It drops data, so only use it on a project
-- that has nothing real in it yet.
--
-- drop table if exists student_answers cascade;
-- drop table if exists test_questions cascade;
-- drop table if exists attempt_questions cascade;
-- drop table if exists test_attempts cascade;
-- drop table if exists questions cascade;
-- drop table if exists profiles cascade;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
-- Student accounts. Not used yet: sign-in is still a local placeholder until we
-- wire up Supabase Auth, but the table is here so attempts can point at it.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  grade_level int not null default 9,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Question bank
-- ---------------------------------------------------------------------------
-- The library the admin dashboard writes into, and the pool that generated
-- mock tests are drawn from.
--
-- correct_answer stores the answer text rather than the letter. The importer
-- resolves "A"/"B"/"C"/"D" from a spreadsheet into the matching option text on
-- the way in, so marking is a single comparison everywhere downstream.

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null,
  topic_id text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  type text not null check (type in ('multiple-choice', 'short-answer')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer text not null,
  explanation text not null default '',
  image_url text,
  paper_year int,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The generator filters on subject + topic + difficulty on every test creation.
create index if not exists questions_lookup_idx
  on questions (subject_id, topic_id, difficulty);

create index if not exists questions_subject_idx on questions (subject_id);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists questions_set_updated_at on questions;
create trigger questions_set_updated_at
  before update on questions
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Attempts
-- ---------------------------------------------------------------------------
-- One row per test a student sits.
--
-- student_id is the eventual Supabase Auth link. student_key is the temporary
-- browser-generated id used before auth exists, so history works today and can
-- be migrated across later.

create table if not exists test_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade,
  student_key text not null,
  subject_id text not null,
  topic_ids text[] not null default '{}',
  difficulty_mode text not null check (difficulty_mode in ('easy', 'medium', 'hard', 'custom')),
  question_count int not null,
  time_limit_minutes int,
  score int,
  total_questions int,
  percentage numeric,
  time_taken_seconds int,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create index if not exists attempts_student_idx
  on test_attempts (student_key, submitted_at desc);

-- ---------------------------------------------------------------------------
-- Attempt questions
-- ---------------------------------------------------------------------------
-- The questions as they were served for one attempt, plus the answer given.
--
-- Prompt, options, answer and explanation are deliberately copied rather than
-- only referenced. If an admin later edits or deletes a question, past results
-- and their review screens stay exactly as the student saw them.

create table if not exists attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references test_attempts(id) on delete cascade,
  question_id uuid references questions(id) on delete set null,
  position int not null,
  subject_id text not null,
  topic_id text not null,
  difficulty text not null,
  type text not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer text not null,
  explanation text not null default '',
  image_url text,
  student_answer text,
  is_correct boolean,
  created_at timestamptz not null default now()
);

create index if not exists attempt_questions_attempt_idx
  on attempt_questions (attempt_id, position);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- The API talks to Postgres with the service role key, which bypasses RLS, so
-- these policies govern anything connecting with the public anon key instead.
--
-- Deliberately: the question bank has no anon policy at all. Students must not
-- be able to read the answer column straight out of the database, so the only
-- route to questions is through the API, which strips answers before sending.

alter table profiles enable row level security;
alter table questions enable row level security;
alter table test_attempts enable row level security;
alter table attempt_questions enable row level security;

drop policy if exists "own profile readable" on profiles;
create policy "own profile readable" on profiles
  for select using (auth.uid() = id);

drop policy if exists "own profile writable" on profiles;
create policy "own profile writable" on profiles
  for update using (auth.uid() = id);

drop policy if exists "own attempts readable" on test_attempts;
create policy "own attempts readable" on test_attempts
  for select using (auth.uid() = student_id);

drop policy if exists "own attempt questions readable" on attempt_questions;
create policy "own attempt questions readable" on attempt_questions
  for select using (
    exists (
      select 1 from test_attempts
      where test_attempts.id = attempt_questions.attempt_id
        and test_attempts.student_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage for question images
-- ---------------------------------------------------------------------------
-- Maths questions carry diagrams. The admin dashboard uploads them here and
-- stores the resulting public URL on the question row.

insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', true)
on conflict (id) do nothing;

drop policy if exists "question images publicly readable" on storage.objects;
create policy "question images publicly readable" on storage.objects
  for select using (bucket_id = 'question-images');
