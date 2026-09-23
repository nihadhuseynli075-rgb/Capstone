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
