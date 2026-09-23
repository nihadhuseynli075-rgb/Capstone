-- Exampeak: the whole schema, in one run.
--
-- Paste this into the Supabase SQL editor (Dashboard -> SQL Editor -> New
-- query) and run it. It is migrations 0001 to 0007 concatenated in order, with
-- nothing else added, so it stays the same thing the numbered files say.
--
-- ---------------------------------------------------------------------------
-- Safe to run on a database that already has some of this
-- ---------------------------------------------------------------------------
-- Every migration here is written to be run twice without complaining:
-- tables are `create table if not exists`, functions and views are `create or
-- replace`, every policy is dropped before it is created, constraints are
-- added inside a guard that checks pg_constraint first, and the backfills only
-- touch rows that are still null.
--
-- So running the lot is a no-op for anything already applied. If you know
-- 0001-0006 are in, running 0007_profiles_and_google.sql on its own does the
-- same job faster.
--
-- The whole thing is one transaction. If any statement fails, nothing is
-- applied and the database is left exactly as it was, rather than half
-- migrated with no record of where it stopped.
--
-- One thing this file cannot do for you: the commented-out drop block at the
-- top of 0001 stays commented out. Read it before you uncomment it -- it is
-- there for clearing out a project that has nothing real in it yet, and it
-- deletes every question and every result.

begin;

-- ---------------------------------------------------------------------------
-- 0001_initial_schema.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- 0002_auth_profiles.sql
-- ---------------------------------------------------------------------------

-- Exampeak: student accounts.
--
-- Run this in the Supabase SQL editor after 0001_initial_schema.sql.
--
-- 0001 already created the `profiles` table and pointed `test_attempts` at it.
-- This migration makes it actually fill up: a row appears in `profiles` the
-- moment somebody signs up, rather than the app having to remember to create
-- one and getting it wrong when a sign-up half fails.

-- ---------------------------------------------------------------------------
-- Fill profiles on sign-up
-- ---------------------------------------------------------------------------
-- The display name is submitted as user metadata by the register form, so it
-- arrives on the auth row and is copied here. Security definer is required:
-- the trigger runs as the signing-up user, who has no rights on `profiles`.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Keep the profile in step with the account
-- ---------------------------------------------------------------------------
-- Changing your name in settings writes to auth user metadata, so mirror it
-- back here. Without this, `profiles.full_name` would be whatever the name was
-- on the day the account was made, which is exactly the sort of quiet drift the
-- friends list would later surface.

create or replace function handle_user_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    full_name = coalesce(new.raw_user_meta_data ->> 'full_name', full_name),
    email = new.email
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row
  execute function handle_user_update();

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- Anyone who signed up between 0001 and this migration has no profile row.

insert into public.profiles (id, full_name, email)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1)),
  users.email
from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Attempts and the account
-- ---------------------------------------------------------------------------
-- Attempts carry both `student_key` (the browser-generated guest id) and a
-- nullable `student_id`. Once a student signs in, `student_key` holds their
-- auth user id, so this index is what makes history lookups by account fast.
--
-- The guest key stays the primary lookup on purpose: it is the one identifier
-- that exists whether or not somebody has signed in, so the API does not need
-- two code paths for reading history.

create index if not exists attempts_student_key_idx
  on test_attempts (student_key);

-- Let a signed-in student read their own attempts directly, for anything that
-- later wants to query without going through the API. The API itself uses the
-- service role key and bypasses this.
drop policy if exists "own attempts readable by key" on test_attempts;
create policy "own attempts readable by key" on test_attempts
  for select using (auth.uid()::text = student_key);

drop policy if exists "own attempt questions readable by key" on attempt_questions;
create policy "own attempt questions readable by key" on attempt_questions
  for select using (
    exists (
      select 1 from test_attempts
      where test_attempts.id = attempt_questions.attempt_id
        and test_attempts.student_key = auth.uid()::text
    )
  );


-- ---------------------------------------------------------------------------
-- 0003_attempt_links.sql
-- ---------------------------------------------------------------------------

-- Exampeak: link attempts to accounts properly, and index the question link.
--
-- Run this in the Supabase SQL editor after 0002_auth_profiles.sql.
--
-- Two things 0001 set up but never finished.

-- ---------------------------------------------------------------------------
-- 1. test_attempts.student_id was always null
-- ---------------------------------------------------------------------------
-- 0001 created the column, pointed it at profiles, and wrote an RLS policy
-- against it. The API only ever inserted `student_key`, so `student_id` stayed
-- null on every row and this policy from 0001 could never match a single one:
--
--   create policy "own attempts readable" on test_attempts
--     for select using (auth.uid() = student_id);
--
-- Nothing broke, because the API connects with the service role key and skips
-- RLS entirely. But anything reading with the anon key would have quietly got
-- no rows back, and an account deletion would have left its attempts behind
-- rather than cascading.
--
-- The API now sets `student_id` whenever the student is signed in. This fills
-- it in for everything recorded before that change.
--
-- `student_key` holds an auth user id once somebody signs in and a browser
-- generated guest id before that, so the match is on the text of the key rather
-- than a cast: guest keys are not account ids, and some older keys are not even
-- uuids.

update test_attempts
set student_id = account.id
from (select id, id::text as key from profiles) as account
where test_attempts.student_id is null
  and test_attempts.student_key = account.key;

-- Used by the "own attempts readable" policy above, and by any later query that
-- goes account-first rather than key-first.
create index if not exists attempts_student_id_idx
  on test_attempts (student_id);

-- ---------------------------------------------------------------------------
-- 2. The question link had no index
-- ---------------------------------------------------------------------------
-- attempt_questions.question_id is a foreign key with `on delete set null`, so
-- deleting one question from the bank makes Postgres find every attempt row
-- pointing at it. Without an index that is a full scan of the table, and
-- attempt_questions grows by one row per question per test sat - it becomes the
-- largest table in the schema quickly.
--
-- Deleting a question from the admin dashboard is the operation this keeps fast.

create index if not exists attempt_questions_question_idx
  on attempt_questions (question_id);


-- ---------------------------------------------------------------------------
-- 0004_question_marks.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- 0005_daily_quiz_and_friends.sql
-- ---------------------------------------------------------------------------

-- Exampeak: daily quiz, friends and the leaderboard.
--
-- Run this in the Supabase SQL editor after 0004_question_marks.sql.
--
-- This is the schema behind the features agreed in the 19 Sep review: a short
-- quiz offered once a day, a streak that makes the next one harder, a friends
-- list, and a single leaderboard covering both quizzes and mock exams.
--
-- ---------------------------------------------------------------------------
-- Three decisions worth stating before the tables
-- ---------------------------------------------------------------------------
--
-- 1. Quiz questions live in their own bank, not in `questions`.
--
--    A quiz question is derived from a past-paper question but is not a copy of
--    it: same topic, re-levelled, and deliberately worded differently so a
--    student does not meet the identical question in the quiz and then again in
--    a mock exam. `source_question_id` records where it came from, which is
--    what makes "a quiz question on this topic at this level" answerable
--    without dragging the exam bank's difficulty scale into it.
--
--    It also keeps the mock exam generator honest. If quiz questions sat in
--    `questions`, every generated exam would start pulling simplified quiz
--    material into papers meant to mirror the real thing.
--
-- 2. One leaderboard, not two.
--
--    Splitting it per quiz and per exam was considered and dropped: a student
--    does not much care which half of the app their progress came from, and two
--    boards mostly produce two rankings nobody can compare. Friends versus
--    global is a filter over the one board rather than a second board, which is
--    why there is no `scope` column anywhere below.
--
-- 3. The leaderboard is a view, not a table.
--
--    Stored ranks are the classic thing to get wrong: every attempt has to
--    remember to update them, and the day one path forgets, the board is
--    quietly wrong with nothing to notice it. Computed on read it cannot drift.
--    If it ever gets slow it becomes a materialised view refreshed on submit,
--    and nothing that reads it has to change.

-- ---------------------------------------------------------------------------
-- 1. The quiz question bank
-- ---------------------------------------------------------------------------
-- Multiple choice only. That was a deliberate limit: a daily quiz has to be
-- finishable in a couple of minutes on a phone, and short-answer marking is
-- neither quick to do nor quick to trust. The check constraint is there so the
-- limit is enforced rather than merely intended -- widening it later is one
-- migration, whereas discovering half the bank is unmarkable is not.
--
-- `level` is 1 to 5 rather than easy/medium/hard, because the streak has to
-- step through it in order. Three named bands give the progression almost
-- nowhere to go after the first week.

create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  source_question_id uuid references questions(id) on delete set null,
  subject_id text not null,
  topic_id text not null,
  level int not null check (level between 1 and 5),
  type text not null default 'multiple-choice' check (type = 'multiple-choice'),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer text not null,
  explanation text not null default '',
  image_url text,
  marks int not null default 1 check (marks > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Building a quiz asks for questions by subject, topic and level every time.
create index if not exists quiz_questions_lookup_idx
  on quiz_questions (subject_id, topic_id, level);

-- `on delete set null` above means deleting one exam question makes Postgres
-- look for every quiz question derived from it. Same reasoning as the index
-- 0003 added to attempt_questions.
create index if not exists quiz_questions_source_idx
  on quiz_questions (source_question_id);

drop trigger if exists quiz_questions_set_updated_at on quiz_questions;
create trigger quiz_questions_set_updated_at
  before update on quiz_questions
  for each row
  execute function set_updated_at();

comment on table quiz_questions is
  'Daily quiz question bank. Derived from `questions` but re-levelled, never copied verbatim.';
comment on column quiz_questions.source_question_id is
  'The past-paper question this was written from. Null once that question is deleted.';
comment on column quiz_questions.level is
  'Difficulty step 1-5. The streak decides which level a student is served.';

-- ---------------------------------------------------------------------------
-- 2. The quiz for a given day
-- ---------------------------------------------------------------------------
-- A quiz is identified by its date and its level, not by its date alone. Two
-- students opening the app on the same morning are on different streaks and so
-- must be given different quizzes; one shared daily quiz and a per-student
-- difficulty cannot both be true.
--
-- Same date and same level always means the same set of questions, which is
-- what makes two students' scores comparable on the same rung.

create table if not exists daily_quizzes (
  id uuid primary key default gen_random_uuid(),
  quiz_name text not null default '',
  quiz_date date not null default current_date,
  level int not null check (level between 1 and 5),
  question_count int not null default 12 check (question_count between 5 and 30),
  created_at timestamptz not null default now(),
  unique (quiz_date, level)
);

comment on table daily_quizzes is
  'One quiz per date per level, generated on demand the first time somebody at that level asks for it.';

-- The questions as served, in order.
--
-- `on delete restrict` on the question link is the opposite choice to the exam
-- side, and deliberate: attempt_questions copies its prompt and answer so it
-- survives a deletion, whereas this table only points. Refusing the delete is
-- better than a quiz with a hole in it.

create table if not exists daily_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  daily_quiz_id uuid not null references daily_quizzes(id) on delete cascade,
  quiz_question_id uuid not null references quiz_questions(id) on delete restrict,
  position int not null,
  created_at timestamptz not null default now(),
  unique (daily_quiz_id, position),
  unique (daily_quiz_id, quiz_question_id)
);

create index if not exists daily_quiz_questions_question_idx
  on daily_quiz_questions (quiz_question_id);

-- ---------------------------------------------------------------------------
-- 3. Sitting the quiz
-- ---------------------------------------------------------------------------
-- Unlike a mock exam, this needs an account. A streak that only exists in one
-- browser is not a streak, and an anonymous row cannot appear on a leaderboard.
-- So `student_id` is not null here, where `test_attempts.student_id` is
-- nullable and carries a guest key alongside it.
--
-- `quiz_date` is copied from the quiz rather than read back through the join,
-- purely so one-per-day can be a unique constraint. Enforced in the database
-- because the alternative is enforcing it in the API and finding out it raced
-- the day a student double-taps Start.

create table if not exists daily_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  daily_quiz_id uuid not null references daily_quizzes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  quiz_date date not null,
  score int,
  total_questions int,
  total_marks int,
  percentage numeric,
  time_taken_seconds int,
  streak_after int,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (student_id, quiz_date)
);

-- Both the streak calculation and "have I done today's yet?" read this way.
create index if not exists daily_quiz_attempts_student_idx
  on daily_quiz_attempts (student_id, quiz_date desc);

create index if not exists daily_quiz_attempts_quiz_idx
  on daily_quiz_attempts (daily_quiz_id);

comment on column daily_quiz_attempts.streak_after is
  'The streak this attempt produced, kept for the results screen. The leaderboard recomputes it rather than trusting it.';
comment on column daily_quiz_attempts.completed_at is
  'Null while the quiz is still open. A started-but-abandoned quiz counts for nothing and breaks the streak.';

-- ---------------------------------------------------------------------------
-- 4. What the streak is worth
-- ---------------------------------------------------------------------------
-- Five days in a row earns the next level. It is a function rather than a
-- number scattered through the API so the rule can be tuned in one place once
-- there is any evidence about whether it climbs too fast.

create or replace function daily_quiz_level_for_streak(streak int)
returns int
language sql
immutable
as $$
  select least(5, 1 + (greatest(coalesce(streak, 0), 0) / 5));
$$;

comment on function daily_quiz_level_for_streak(int) is
  'Level a student on this streak should be served: level 1 to start, one rung per five days in a row, capped at 5.';

-- ---------------------------------------------------------------------------
-- 5. Friends
-- ---------------------------------------------------------------------------
-- A request from one student to another, so the row is directional even though
-- an accepted friendship is not. Reading somebody's friends therefore means
-- looking at both columns, which `friends_of` below does once so that nothing
-- else has to remember to.
--
-- The two constraints are the ones that matter: nobody is their own friend, and
-- the same pair cannot be stored twice in the same direction.

create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  friend_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (user_id, friend_id),
  check (user_id <> friend_id)
);

-- Incoming requests, and the reverse direction of an accepted friendship.
create index if not exists friendships_friend_idx
  on friendships (friend_id, status);

create index if not exists friendships_user_idx
  on friendships (user_id, status);

comment on table friendships is
  'Directional friend requests. An accepted row means friends both ways; read it through `friends_of`.';

-- Both sides of every accepted friendship, as a flat pair. The friends filter
-- on the leaderboard is a join against this.
create or replace view friends_of as
  select user_id as student_id, friend_id as friend_id
  from friendships
  where status = 'accepted'
  union
  select friend_id as student_id, user_id as friend_id
  from friendships
  where status = 'accepted';

-- ---------------------------------------------------------------------------
-- 6. The leaderboard
-- ---------------------------------------------------------------------------
-- Marks earned on submitted mock exams plus marks earned on completed daily
-- quizzes. Both sides are in marks rather than questions answered, which is why
-- 0004 had to land first: before it, a one-mark quiz question and a six-mark
-- exam question counted the same.
--
-- Current and best streak are gaps-and-islands over the days a student has
-- completed a quiz. Consecutive dates share `quiz_date - row_number()`, so each
-- unbroken run collapses into one group. A run counts as current only if it
-- reaches yesterday or today: anything older has already been broken, and
-- today's quiz not being done yet must not end the streak at lunchtime.
--
-- Only `user_id` and `full_name` are exposed. The view runs with its owner's
-- rights, so everything selected here is visible to every signed-in student --
-- email stays out for that reason.

create or replace view leaderboard as
  with exam_totals as (
    select
      student_id,
      coalesce(sum(score), 0) as exam_score,
      count(*) as exams_completed
    from test_attempts
    where student_id is not null
      and submitted_at is not null
    group by student_id
  ),
  quiz_days as (
    select distinct student_id, quiz_date
    from daily_quiz_attempts
    where completed_at is not null
  ),
  quiz_islands as (
    select
      student_id,
      quiz_date,
      quiz_date - (row_number() over (partition by student_id order by quiz_date))::int as run_key
    from quiz_days
  ),
  quiz_runs as (
    select
      student_id,
      count(*) as run_length,
      max(quiz_date) as run_ended
    from quiz_islands
    group by student_id, run_key
  ),
  quiz_streaks as (
    select
      student_id,
      coalesce(max(run_length) filter (where run_ended >= current_date - 1), 0) as current_streak,
      coalesce(max(run_length), 0) as best_streak
    from quiz_runs
    group by student_id
  ),
  quiz_totals as (
    select
      student_id,
      coalesce(sum(score), 0) as quiz_score,
      count(*) as quizzes_completed
    from daily_quiz_attempts
    where completed_at is not null
    group by student_id
  )
  select
    profiles.id as user_id,
    profiles.full_name,
    coalesce(quiz_totals.quiz_score, 0) + coalesce(exam_totals.exam_score, 0) as total_score,
    coalesce(quiz_totals.quiz_score, 0) as quiz_score,
    coalesce(exam_totals.exam_score, 0) as exam_score,
    coalesce(quiz_totals.quizzes_completed, 0) as quizzes_completed,
    coalesce(exam_totals.exams_completed, 0) as exams_completed,
    coalesce(quiz_streaks.current_streak, 0) as current_streak,
    coalesce(quiz_streaks.best_streak, 0) as best_streak,
    rank() over (
      order by coalesce(quiz_totals.quiz_score, 0) + coalesce(exam_totals.exam_score, 0) desc
    ) as rank
  from profiles
  left join quiz_totals on quiz_totals.student_id = profiles.id
  left join quiz_streaks on quiz_streaks.student_id = profiles.id
  left join exam_totals on exam_totals.student_id = profiles.id;

comment on view leaderboard is
  'Global ranking over exam marks and quiz marks combined. Join against `friends_of` for the friends view.';

-- ---------------------------------------------------------------------------
-- 7. Row level security
-- ---------------------------------------------------------------------------
-- Same shape as 0001: the API uses the service role key and bypasses all of
-- this, so these policies govern anything connecting with the anon key.
--
-- `quiz_questions` gets no select policy at all, for exactly the reason
-- `questions` has none. `correct_answer` is on the row, so a student who can
-- read the table can read the answers. Serving a quiz goes through the API,
-- which strips them.

alter table quiz_questions enable row level security;
alter table daily_quizzes enable row level security;
alter table daily_quiz_questions enable row level security;
alter table daily_quiz_attempts enable row level security;
alter table friendships enable row level security;

-- Which quiz exists for a date and a level gives nothing away.
drop policy if exists "daily quizzes readable" on daily_quizzes;
create policy "daily quizzes readable" on daily_quizzes
  for select to authenticated using (true);

drop policy if exists "own quiz attempts readable" on daily_quiz_attempts;
create policy "own quiz attempts readable" on daily_quiz_attempts
  for select using (auth.uid() = student_id);

-- Either side can see the request: the sender needs to know it is still
-- pending, and the recipient needs to see it at all.
drop policy if exists "own friendships readable" on friendships;
create policy "own friendships readable" on friendships
  for select using (auth.uid() = user_id or auth.uid() = friend_id);

-- You may send a request as yourself and as nobody else.
drop policy if exists "own friendships insertable" on friendships;
create policy "own friendships insertable" on friendships
  for insert with check (auth.uid() = user_id);

-- Accepting or blocking is the recipient's decision.
drop policy if exists "incoming friendships answerable" on friendships;
create policy "incoming friendships answerable" on friendships
  for update using (auth.uid() = friend_id);

-- Withdrawing a request, or unfriending, from either side.
drop policy if exists "own friendships deletable" on friendships;
create policy "own friendships deletable" on friendships
  for delete using (auth.uid() = user_id or auth.uid() = friend_id);

-- A leaderboard nobody else appears on is not a leaderboard, so this one view
-- is readable by any signed-in student. It carries name, scores and streaks and
-- nothing else.
grant select on leaderboard to authenticated;
grant select on friends_of to authenticated;

-- ---------------------------------------------------------------------------
-- What still has to change in the app
-- ---------------------------------------------------------------------------
-- Nothing reads any of this yet. FriendsPage on master is a static stub and
-- there is no quiz UI at all, so this migration is inert until:
--
--   * `packages/shared` gains QuizQuestion, DailyQuiz, DailyQuizAttempt,
--     Friendship and LeaderboardRow, next to BankQuestion and the attempt types;
--   * a quiz repository, alongside attemptRepository and questionRepository,
--     that finds-or-creates the quiz for (current_date,
--     daily_quiz_level_for_streak(streak)) and fills it from `quiz_questions` --
--     generated on demand rather than on a schedule, so there is no overnight
--     cron job to go wrong;
--   * `routes/quiz.ts` for start and submit, reusing markAttempt from
--     services/marking.ts: a quiz is marked exactly like an exam now that both
--     sides count marks;
--   * `routes/friends.ts` for request, accept and remove, plus a lookup by
--     email that returns an id and a name and nothing else;
--   * FriendsPage wired to those endpoints, and a leaderboard page reading
--     `leaderboard` with a global/friends toggle -- the toggle being a join
--     against `friends_of`, not a second query against a second table;
--   * the admin dashboard given a way to add quiz questions, most likely a
--     "write a quiz version" action on an existing question, so that
--     `source_question_id` gets filled in as a matter of course rather than
--     left null by whoever is in a hurry.


-- ---------------------------------------------------------------------------
-- 0006_view_privileges.sql
-- ---------------------------------------------------------------------------

-- Exampeak: keep the leaderboard and the friends list away from anonymous readers.
--
-- Run this in the Supabase SQL editor after 0005_daily_quiz_and_friends.sql.
--
-- 0005 created two views and granted them to `authenticated`. Two things it
-- did not account for:
--
-- 1. Supabase grants every new table and view in `public` to `anon` as well,
--    through default privileges. Row level security is what normally makes
--    that harmless, but a view runs with its owner's rights and skips row level
--    security, so the grant is all there is. Anyone holding the anon key -
--    which ships inside the web app - could read every student's name, id and
--    scores from `leaderboard`, and every friendship from `friends_of`, without
--    signing in.
--
-- 2. `friends_of` runs with its owner's rights too, so even a signed-in
--    student could read every other student's friendships through it. The
--    policies 0005 put on `friendships` never applied to it.
--
-- The leaderboard is meant to show every student to every signed-in student,
-- so it keeps running as its owner and only loses the anonymous grant.
-- `friends_of` switches to running as whoever reads it, so the friendships
-- policies decide what each student sees: their own friendships, which is all
-- the friends filter on the leaderboard needs.
--
-- `security_invoker` needs Postgres 15 or later, which Supabase projects have
-- run since 2023. Every statement here is safe to run twice.

revoke all on leaderboard from anon;
revoke all on friends_of from anon;

alter view friends_of set (security_invoker = true);


-- ---------------------------------------------------------------------------
-- 0007_profiles_and_google.sql
-- ---------------------------------------------------------------------------

-- Exampeak: profile photos, Google sign-in, and the profile as the API's to write.
--
-- Run this in the Supabase SQL editor after 0006_view_privileges.sql.
--
-- ---------------------------------------------------------------------------
-- Why the profile stops copying the account's name
-- ---------------------------------------------------------------------------
-- 0002 kept `profiles.full_name` in step with the name stored on the Supabase
-- account, and the settings page changed a name by changing it there. That
-- held while every account was an email and a password.
--
-- Google sign-in breaks it. Every time somebody signs in with Google, Supabase
-- writes Google's name and photo over the account's `full_name` and
-- `avatar_url`. With 0002's trigger mirroring that, a student who renamed
-- themselves on the profile page would see the old name come back the next
-- time they signed in, and a photo they uploaded would be swapped back too.
--
-- So from here the profile row is the record, and only the API writes it. The
-- name is checked there, and a photo is always one the API uploaded itself.
-- The trigger that runs on account changes now keeps only the email in step,
-- since that is the one thing the account owns.
--
-- Every statement here is safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. The photo
-- ---------------------------------------------------------------------------

alter table profiles
  add column if not exists avatar_url text;

comment on column profiles.avatar_url is
  'Public URL of the profile photo: one the API uploaded to the avatars bucket, or the Google photo the account was made with. Null shows initials.';

-- ---------------------------------------------------------------------------
-- 2. A new account, from either kind of sign-up
-- ---------------------------------------------------------------------------
-- As in 0002, plus Google. Google sends the name as `full_name` and again as
-- `name`, so both are tried before falling back to the start of the email.
--
-- The photo is only ever taken from a Google sign-up, and only when it is an
-- address of Google's own. `provider` in the app metadata is set by Supabase
-- itself, whereas the user metadata is whatever the sign-up request carried,
-- and a sign-up does not have to come from our app: without both checks,
-- anyone could name any address on the internet as their photo, and every
-- browser that later showed them would go and fetch from there.
--
-- The name is squeezed onto one line and cut to 60 characters, the same limit
-- the profile page holds a typed name to. Otherwise a sign-up sent straight to
-- Supabase could put a name of any length, with any layout in it, on the
-- leaderboard.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  google_photo text;
begin
  if new.raw_app_meta_data ->> 'provider' = 'google' then
    google_photo := nullif(
      coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
      ''
    );

    if google_photo !~* '^https://([a-z0-9-]+\.)*googleusercontent\.com/' then
      google_photo := null;
    end if;
  end if;

  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    left(
      regexp_replace(
        coalesce(
          nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
          nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
          split_part(new.email, '@', 1)
        ),
        '\s+', ' ', 'g'
      ),
      60
    ),
    new.email,
    google_photo
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Account changes: the email only
-- ---------------------------------------------------------------------------
-- The name and photo are left alone, for the reason at the top. Checking that
-- the email really changed also stops every sign-in, which updates the
-- account's last-sign-in time, from rewriting the profile row for nothing.

create or replace function handle_user_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set email = new.email
    where id = new.id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Nobody writes a profile but the API
-- ---------------------------------------------------------------------------
-- 0001 let a signed-in student update their own row with the anon key. Nothing
-- in the app does that, and leaving it open would let anyone step around the
-- API's checks: a name of any length on the leaderboard, or any URL at all as
-- a photo. Reading your own row stays allowed.

drop policy if exists "own profile writable" on profiles;

-- ---------------------------------------------------------------------------
-- 5. Where photos are kept
-- ---------------------------------------------------------------------------
-- Public, so a photo is an ordinary image URL that any page can show, and
-- limited to small images of the three types the API accepts. Each student's
-- photos sit in a folder named after their account id, which is what lets the
-- API clear them all out when the account is deleted.
--
-- There are deliberately no storage policies. The API uploads and deletes with
-- the service role key, which bypasses them, and a public bucket serves its
-- files by URL without consulting them. With none, the anon key can neither
-- list the bucket nor write to it.
--
-- Rerunning this puts the bucket's settings back to these.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


commit;
