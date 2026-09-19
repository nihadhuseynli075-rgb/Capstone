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
