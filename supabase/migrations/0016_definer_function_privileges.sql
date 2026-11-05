-- Exampeak: the trigger functions that run with raised rights are not callable
-- by anyone.
--
-- Run this in the Supabase SQL editor after 0015_question_images_limits.sql.
-- It changes only who may call three existing functions. No table, row or
-- trigger changes, and nothing the API does changes.
--
-- From the repo lint of 5 November 2026.
--
-- Every statement here is safe to run twice.

-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- handle_new_user() and handle_user_update() (0002, replaced in 0007 and 0012)
-- copy a new or changed account into `profiles`, and profiles_fill_username()
-- (0012, replaced in 0013) gives a profile its username. All three are
-- `security definer`, so they run with their owner's rights rather than the
-- caller's, which is what lets the sign-up trigger write a profile.
--
-- Postgres grants EXECUTE on every new function to PUBLIC, so the signed-out
-- `anon` role and every signed-in student could in principle call them. A
-- trigger function cannot be called on its own through PostgREST, so this is
-- not an open door today, but nothing should rely on that: the two username
-- generators were already closed off in 0012 and 0013 for the same reason.
--
-- A trigger fires whether or not the role that set it off may EXECUTE the
-- function: Postgres checks that right when the trigger is created, not each
-- time it runs. Sign-up, profile updates and usernames carry on as before.

-- ---------------------------------------------------------------------------
-- The change
-- ---------------------------------------------------------------------------
-- All three exist once 0013 is in, which this follows.

revoke all on function handle_new_user() from public, anon, authenticated;
revoke all on function handle_user_update() from public, anon, authenticated;
revoke all on function profiles_fill_username() from public, anon, authenticated;
