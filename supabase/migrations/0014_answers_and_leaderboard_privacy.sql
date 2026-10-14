-- Exampeak: answers stay hidden until hand-in.
--
-- Run this in the Supabase SQL editor after 0013_friends_privacy.sql. It needs
-- 0001 and 0002 (the attempt tables and their policies) to be in already.
--
-- A fix from the bug hunt of 14 October 2026:
--
--   Part 1. The answers on a test cannot be read from the database until the
--           student has handed it in.
--
-- It changes nothing the API does. The API uses the secret key, which
-- bypasses row level security.
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
