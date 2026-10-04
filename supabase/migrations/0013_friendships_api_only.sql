-- Exampeak: only the API writes friendships.
--
-- Run this in the Supabase SQL editor after 0005_daily_quiz_and_friends.sql.
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- 0005 let a signed-in student write to `friendships` directly with the anon
-- key, guarded by three policies. None of them looked at the status, and the
-- update policy had no WITH CHECK, so Postgres held the new row only to
-- "friend_id is me". Anyone signed in could therefore, straight through
-- PostgREST and without the API:
--
--   * insert a row from themselves to any account with status 'accepted',
--     and be that student's friend without being asked;
--   * take a request somebody else had sent them and rewrite its user_id to
--     any account, again as 'accepted';
--   * insert a 'blocked' row, so the other student could never ask them.
--
-- A friend sees another student's test figures, so the first two handed
-- anyone's progress to whoever wanted it. Account ids are not secret (the
-- leaderboard view lists them), so knowing who to aim at was no obstacle.
--
-- Nothing in the browser writes this table: every request, answer and removal
-- goes through the API's /api/friends routes, which use the service role key
-- and decide each case themselves. So the write policies are simply dropped.
-- With RLS on and no policy for a command, Postgres refuses that command for
-- the anon and authenticated roles. Reading your own rows stays allowed.
--
-- Every statement here is safe to run twice.

drop policy if exists "own friendships insertable" on friendships;
drop policy if exists "incoming friendships answerable" on friendships;
drop policy if exists "own friendships deletable" on friendships;

-- Belt and braces: even a policy added back by hand later finds no privilege
-- to write with. The service role, which the API uses, keeps its own.
revoke insert, update, delete on friendships from anon, authenticated;
