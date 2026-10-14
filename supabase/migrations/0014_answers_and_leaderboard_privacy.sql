-- Exampeak: answers stay hidden until hand-in, and the leaderboard is closed.
--
-- Run this in the Supabase SQL editor after 0013_friends_privacy.sql. It needs
-- 0001 and 0002 (the attempt tables and their policies) and 0005 (the
-- leaderboard view) to be in already.
--
-- Two fixes from the bug hunt of 14 October 2026, in one file:
--
--   Part 1. The answers on a test cannot be read from the database until the
--           student has handed it in.
--   Part 2. No signed-in student can read the leaderboard view, which lists
--           every student's name and scores.
--
-- Neither changes anything the API does. It uses the secret key, which
-- bypasses row level security, and it keeps its own rights on the view.
--
-- Every statement here is safe to run twice.

-- ===========================================================================
-- Part 1. Answers stay hidden until the test is handed in
-- ===========================================================================
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- When a test starts, the API copies every question onto the attempt with its
-- answer (for a written question, the marking guide, which 0009 keeps in the
-- same column), so that editing the bank later cannot change a paper already
-- handed out. The API takes the answers out before the paper reaches the
-- browser.
--
-- But 0001's "own attempt questions readable" and 0002's "own attempt
-- questions readable by key" let a signed-in student read their own papers'
-- rows straight through PostgREST, and neither asked whether the paper had
-- been handed in. With the publishable key from the page and their own access
-- token, a student could read the answers to the test they were sitting:
--
--   GET /rest/v1/attempt_questions?attempt_id=eq.<the open test>&select=position,correct_answer
--
-- Both policies are made again with one more condition: the test has been
-- handed in. Going back over a test afterwards reads exactly what it did.

drop policy if exists "own attempt questions readable" on attempt_questions;
create policy "own attempt questions readable" on attempt_questions
  for select using (
    exists (
      select 1 from test_attempts
      where test_attempts.id = attempt_questions.attempt_id
        and test_attempts.student_id = auth.uid()
        and test_attempts.submitted_at is not null
    )
  );

drop policy if exists "own attempt questions readable by key" on attempt_questions;
create policy "own attempt questions readable by key" on attempt_questions
  for select using (
    exists (
      select 1 from test_attempts
      where test_attempts.id = attempt_questions.attempt_id
        and test_attempts.student_key = auth.uid()::text
        and test_attempts.submitted_at is not null
    )
  );

-- ===========================================================================
-- Part 2. The leaderboard is closed until a page uses it
-- ===========================================================================
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- 0005 granted `leaderboard` to every signed-in account, and 0006 kept that
-- grant on purpose, taking only the anonymous one away: the leaderboard was
-- "meant to show every student to every signed-in student". The view runs
-- with its owner's rights, so no row level security applies to it, and it
-- lists every profile: full name, marks, streaks and rank. Any account could
-- read all of it through PostgREST:
--
--   GET /rest/v1/leaderboard?select=user_id,full_name,exam_score,rank
--
-- No page in the app reads the view yet, and the privacy page tells students,
-- who are 14 and 15, that only the friends they accept see their figures. So
-- the grant is taken back, and this replaces 0006's decision to keep it.
-- (Rerunning 0005 on its own would grant it again; run-all.sql runs this
-- after it, which takes it away again.)
--
-- When a leaderboard page is built, do not simply grant this back. Switch the
-- view to `security_invoker`, as 0006 did for `friends_of`, so that the
-- policies on the tables it reads decide what each student sees; give those
-- tables policies that let a student read their own figures and their
-- accepted friends', and nobody else's; and make the privacy page say who
-- sees what on the leaderboard before it ships.

revoke all on leaderboard from authenticated;
