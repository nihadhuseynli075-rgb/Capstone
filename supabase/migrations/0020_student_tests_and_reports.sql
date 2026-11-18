-- Exampeak: tests students make themselves, and reports of questions that are
-- wrong.
--
-- Run this in the Supabase SQL editor after 0019_age_checks.sql (or run all
-- of run-all.sql, which now ends with it). Nothing already in the database
-- changes: two tables are added, and test_attempts gains one column that is
-- empty on every attempt so far.
--
-- From the session with Nihad on 18 November 2026.
--
-- Every statement here is safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. Student-made tests
-- ---------------------------------------------------------------------------
-- A signed-in student puts a test together from questions they write and
-- questions they pick from the bank, and shares it with their friends or
-- publishes it for everyone. Published tests are not checked first: anyone
-- who sits one can report a question that is wrong (section 2), and the admin
-- can take a test back to friends only.
--
-- The questions are one JSON list on the row, so a test is saved in one write
-- and can never be left half saved (PostgREST has no transactions). Each item
-- is either a question the student wrote, with its answer, or the id of a bank
-- question, which is looked up when the test is sat: the student picked it
-- without being shown its answer, and the bank's own edits reach it. The API
-- checks the shape of every item; the database checks it is a list.

create table if not exists student_tests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  title text not null check (btrim(title) <> '' and char_length(title) <= 120),
  subject_id text not null,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  -- 'friends': the owner's friends can see and sit it. 'public': everyone can.
  visibility text not null default 'friends' check (visibility in ('friends', 'public')),
  time_limit_minutes int check (time_limit_minutes is null or time_limit_minutes between 1 and 180),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_tests_owner_idx on student_tests (owner_id, created_at desc);
create index if not exists student_tests_public_idx on student_tests (created_at desc) where visibility = 'public';

drop trigger if exists student_tests_set_updated_at on student_tests;
create trigger student_tests_set_updated_at
  before update on student_tests
  for each row
  execute function set_updated_at();

-- Only the API reads and writes it, with the secret key, which passes RLS. It
-- decides who may see a test (the owner, their friends, or everyone).
alter table student_tests enable row level security;
revoke all on student_tests from anon, authenticated;

comment on table student_tests is
  'Tests a student made: their own questions and picks from the bank, shared with friends or published. API only.';

-- The student-made test an attempt was a sitting of, if it was one. Kept so a
-- report from that attempt can name the test. Deleting the test leaves the
-- attempt in its sitter's history, as a test that is no longer there.
alter table test_attempts
  add column if not exists student_test_id uuid references student_tests (id) on delete set null;

create index if not exists test_attempts_student_test_idx on test_attempts (student_test_id);

comment on column test_attempts.student_test_id is
  'The student-made test this attempt sat, or null for a test drawn from the bank.';

-- ---------------------------------------------------------------------------
-- 2. Reported questions
-- ---------------------------------------------------------------------------
-- After handing a test in, a student can report one of its questions: the
-- answer key is wrong, no option is right, it cannot be solved, or it is not
-- clear. The admin dashboard lists them under Reported questions.
--
-- A report keeps a copy of the question as it was served (from the attempt),
-- so the admin sees what the student saw even after the question is edited
-- or deleted. It points at the bank question or the student-made test it came
-- from, when there is one, so the admin can fix it at the source.

create table if not exists question_reports (
  id uuid primary key default gen_random_uuid(),
  -- Who reported it: a student key, as on test_attempts, and the account
  -- behind it when there is one.
  reporter_key text not null,
  reporter_id uuid references profiles (id) on delete set null,
  attempt_id uuid references test_attempts (id) on delete set null,
  position int not null check (position >= 0),
  question_id uuid references questions (id) on delete set null,
  student_test_id uuid references student_tests (id) on delete set null,
  subject_id text not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer text not null default '',
  image_url text,
  reason text not null check (reason in ('wrong-answer', 'no-correct-answer', 'impossible', 'unclear', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- One report per question of an attempt: reporting it again is answered as
-- already reported rather than adding a copy.
create unique index if not exists question_reports_attempt_position_key
  on question_reports (attempt_id, position);

create index if not exists question_reports_status_idx on question_reports (status, created_at desc);

alter table question_reports enable row level security;
revoke all on question_reports from anon, authenticated;

comment on table question_reports is
  'Questions students reported as wrong or impossible, with a copy of the question as served. Admin dashboard only.';
