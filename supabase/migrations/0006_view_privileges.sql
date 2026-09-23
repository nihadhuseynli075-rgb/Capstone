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
