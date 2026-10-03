-- Exampeak: usernames, so friends can find each other without knowing an email.
--
-- Run this in the Supabase SQL editor after 0007_profiles_and_google.sql. It
-- does not depend on 0008-0011, so the numbering gaps do not matter.
--
-- ---------------------------------------------------------------------------
-- What changes
-- ---------------------------------------------------------------------------
-- Every profile gets a `username`: what a student is looked up by on the
-- friends page, written "@nihad" in the app. The rules, in one place:
--
--   * 3 to 20 characters, from a-z, 0-9, "_" and ".", starting with a letter;
--   * stored lowercase, so the unique index on it is case-insensitive too:
--     "Nihad" and "nihad" are the same name, and only one student can have it;
--   * never empty: a profile that is inserted without one is given one by a
--     trigger, and this migration gives one to every existing profile, so the
--     column can be NOT NULL.
--
-- The API checks the same format before it writes, and keeps a list of names
-- nobody can pick (admin, exampeak, support...). The database repeats the
-- format as a check constraint, because the API is not the only thing that can
-- reach this table, and a unique index, because "is it free?" followed by
-- "save it" is a race that two students can both win. The API catches the
-- unique violation instead of trusting its own pre-check.
--
-- A student who changes their name does not change their username. It is how
-- friends find them, and it should not move because a display name did.
--
-- Every statement here is safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------
-- Nullable for the moment: existing rows have none until section 4.

alter table profiles
  add column if not exists username text;

comment on column profiles.username is
  'What friends find this student by. Lowercase, 3-20 characters from a-z 0-9 _ . and starting with a letter; unique. Made at sign-up, changeable on the profile page.';

-- ---------------------------------------------------------------------------
-- 2. Making a username out of a name
-- ---------------------------------------------------------------------------
-- Used by the trigger below and the backfill, never by the app directly.
--
-- It tries the display name first, then the part of the email before the "@".
-- Whichever leaves at least three usable characters wins: capital letters go
-- lowercase, the Azerbaijani and Turkish letters lose their marks (so
-- "Hüseynli" becomes "huseynli"), anything else that is not allowed becomes
-- "_", and the result is made to start with a letter and not end in "_" or ".".
-- A name written only in Cyrillic therefore falls through to the email, and an
-- email that gives nothing either becomes "student".
--
-- Then the first free spelling: "nihad", "nihad2", "nihad3"... The name is cut
-- short to make room for the number, so it never passes 20 characters. Names
-- on the reserved list (the same list as packages/shared/src/usernames.ts, with
-- dots and underscores ignored) are never handed out, so somebody whose email
-- is admin@school.az does not turn up in friend search as "admin".
--
-- The email's start is only used when the name gives nothing, but it is
-- visible to friends when it is. Worth knowing, not worth hiding the feature.

create or replace function generate_username(source_name text, source_email text)
returns text
language plpgsql
set search_path = public
as $$
declare
  reserved constant text[] := array[
    'abuse', 'admin', 'administrator', 'anonymous', 'api', 'contact', 'deleted',
    'dim', 'exampeak', 'friends', 'help', 'helpdesk', 'info', 'login',
    'moderator', 'mod', 'noreply', 'null', 'official', 'owner', 'postmaster',
    'profile', 'register', 'root', 'security', 'settings', 'signin', 'signup',
    'staff', 'support', 'sysadmin', 'system', 'team', 'undefined', 'unknown',
    'webmaster', 'www'
  ];
  sources text[] := array[source_name, split_part(source_email, '@', 1)];
  source text;
  base text := null;
  candidate text;
  suffix int := 1;
begin
  foreach source in array sources loop
    candidate := lower(
      translate(coalesce(source, ''), 'əƏıİöÖüÜçÇşŞğĞ', 'eEiIoOuUcCsSgG')
    );
    candidate := regexp_replace(candidate, '[^a-z0-9_.]+', '_', 'g');
    candidate := regexp_replace(candidate, '^[^a-z]+', '');
    candidate := regexp_replace(candidate, '_{2,}', '_', 'g');
    candidate := regexp_replace(candidate, '[_.]+$', '');

    if length(candidate) >= 3 then
      base := candidate;
      exit;
    end if;
  end loop;

  base := left(coalesce(base, 'student'), 20);
  candidate := base;

  loop
    exit when regexp_replace(candidate, '[._]', '', 'g') <> all (reserved)
      and not exists (select 1 from public.profiles where username = candidate);

    suffix := suffix + 1;
    candidate := left(base, 20 - length(suffix::text)) || suffix::text;
  end loop;

  return candidate;
end;
$$;

-- It reads the whole table, which the anon key must not be able to ask it to.
revoke all on function generate_username(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Every new profile gets one
-- ---------------------------------------------------------------------------
-- A profile inserted without a username is given one here, whoever inserts it:
-- the sign-up trigger below, the API making a profile for an account that
-- predates all this, or a rerun of 0002's backfill (which would otherwise stop
-- on the NOT NULL rule below, because that rule is checked before a conflicting
-- row is thrown away). Doing it in one place means nothing that inserts a
-- profile has to know about usernames.
--
-- Security definer, for two reasons: the generator above is closed to everyone
-- else, and it has to see every student's username, not only the ones the
-- inserting role is allowed to read.

create or replace function profiles_fill_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.username := generate_username(new.full_name, new.email);
  return new;
end;
$$;

drop trigger if exists profiles_fill_username on profiles;
create trigger profiles_fill_username
  before insert on profiles
  for each row
  when (new.username is null)
  execute function profiles_fill_username();

-- ---------------------------------------------------------------------------
-- 4. Every profile that has none yet
-- ---------------------------------------------------------------------------
-- One at a time, oldest account first, so that the first "Nihad" keeps the
-- plain "nihad" and the next one becomes "nihad2". A single UPDATE would work
-- out every name before any of them was saved, and hand the same name to both.

do $$
declare
  pending record;
begin
  for pending in
    select id, full_name, email
    from public.profiles
    where username is null
    order by created_at, id
  loop
    update public.profiles
    set username = generate_username(pending.full_name, pending.email)
    where id = pending.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. A new account, from either kind of sign-up
-- ---------------------------------------------------------------------------
-- As 0007 leaves it, with one addition. If two sign-ups work out the same
-- username at the same moment, the second one's insert fails on the unique
-- index. It tries again, which now sees the first, rather than failing the
-- sign-up over a spelling. The username itself is filled in by section 3.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  google_photo text;
  attempt int := 0;
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

  loop
    attempt := attempt + 1;

    begin
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

      exit;
    exception when unique_violation then
      if attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The rules, enforced
-- ---------------------------------------------------------------------------
-- The check is the format above as a regular expression, and lowercase comes
-- with it, since only lowercase letters are allowed. Dropped and added back so
-- running this again checks the rows once more.

alter table profiles
  drop constraint if exists profiles_username_format;

alter table profiles
  add constraint profiles_username_format
  check (username ~ '^[a-z][a-z0-9_.]{2,19}$');

create unique index if not exists profiles_username_key
  on profiles (username);

-- Every row has one now, and the trigger gives every new row one.
alter table profiles
  alter column username set not null;
