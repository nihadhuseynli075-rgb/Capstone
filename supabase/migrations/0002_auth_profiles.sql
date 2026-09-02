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
