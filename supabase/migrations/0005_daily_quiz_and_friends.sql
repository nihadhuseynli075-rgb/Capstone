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
