-- Exampeak: friends and usernames give nothing away.
--
-- Run this in the Supabase SQL editor after 0012_usernames.sql. It needs 0005
-- (the friendships table) and 0012 (usernames) to be in already.
--
-- Two fixes from the friends bug hunt, in one file:
--
--   Part 1. Only the API writes friendships. No signed-in student can make
--           themselves anyone's friend, or block anyone, straight through
--           PostgREST.
--   Part 2. A username is never made out of the email address, and the ones
--           the old generator copied from an address are replaced.
--
-- Every statement here is safe to run twice.

-- ===========================================================================
-- Part 1. Only the API writes friendships
-- ===========================================================================
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
drop policy if exists "own friendships insertable" on friendships;
drop policy if exists "incoming friendships answerable" on friendships;
drop policy if exists "own friendships deletable" on friendships;

-- Belt and braces: even a policy added back by hand later finds no privilege
-- to write with. The service role, which the API uses, keeps its own.
revoke insert, update, delete on friendships from anon, authenticated;

-- ===========================================================================
-- Part 2. A username is never made out of the email address
-- ===========================================================================
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- 0012's generator took the student's name, and when that gave fewer than
-- three usable letters it took the start of the email address instead. A
-- name in Cyrillic or Arabic gives none at all, so "Айсель" signing up as
-- aysel.private2009@mail.ru became "@aysel.private2009", and so did a short
-- name like "Al". The username is printed beside the name for everyone they
-- send a request to and every friend, so that was most of the address handed
-- to people the privacy page promises never see it.
--
-- What changes:
--
--   1. Russian Cyrillic is written out in Latin letters first ("Иван Петров"
--      becomes "ivan_petrov"), since the site is used in Russian and those
--      names were the common way to fall through.
--   2. Nothing is taken from the email. A name that still gives fewer than
--      three letters becomes "student", "student2" and so on, which the
--      student can change on the profile page.
--   3. Every username the old fallback copied from an email address is
--      replaced, one at a time, oldest account first, the way 0012 handed
--      them out. A name counts as copied when the student's name could not
--      have produced a username under 0012's rules and the username is the
--      start of their email, with or without 0012's number on the end. A
--      student who later chose exactly that name by hand is renamed too: the
--      same text is just as much of their address either way.
--
-- The generator now takes the name alone. The old two-argument version is
-- dropped, and the trigger that fills a new profile in is pointed at the new
-- one. (Rerunning 0012 on its own would bring the old one back; run-all.sql
-- runs this straight after it, which puts it right again.)
--
-- ---------------------------------------------------------------------------
-- 1. Russian letters in Latin ones
-- ---------------------------------------------------------------------------
-- Capitals are mapped by hand rather than left to lower(), which only knows
-- them when the database's character type is not "C".

create or replace function transliterate_username_source(source text)
returns text
language sql
immutable
as $$
  select translate(
    replace(replace(replace(replace(replace(replace(replace(replace(replace(
      translate(
        coalesce(source, ''),
        'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
        'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'
      ),
      'щ', 'shch'), 'ш', 'sh'), 'ч', 'ch'), 'ц', 'ts'), 'х', 'kh'),
      'ж', 'zh'), 'ё', 'yo'), 'ю', 'yu'), 'я', 'ya'),
    -- The hard and soft signs have no letter of their own and are dropped:
    -- the "to" list is two shorter than the "from" list.
    'абвгдезийклмнопрстуфыэъь',
    'abvgdeziyklmnoprstufye'
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. The generator, from the name alone
-- ---------------------------------------------------------------------------

create or replace function generate_username(source_name text)
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
  base text;
  candidate text;
  suffix int := 1;
begin
  base := lower(
    translate(
      transliterate_username_source(source_name),
      'əƏıİöÖüÜçÇşŞğĞ',
      'eEiIoOuUcCsSgG'
    )
  );
  base := regexp_replace(base, '[^a-z0-9_.]+', '_', 'g');
  base := regexp_replace(base, '^[^a-z]+', '');
  base := regexp_replace(base, '_{2,}', '_', 'g');
  base := regexp_replace(base, '[_.]+$', '');

  if length(base) < 3 then
    base := 'student';
  end if;

  base := left(base, 20);
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

-- Like 0012's, it reads the whole table, which the API roles must not be able
-- to ask it to.
revoke all on function generate_username(text) from public, anon, authenticated;

create or replace function profiles_fill_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.username := generate_username(new.full_name);
  return new;
end;
$$;

drop function if exists generate_username(text, text);

-- ---------------------------------------------------------------------------
-- 3. Usernames the old fallback copied from an email address
-- ---------------------------------------------------------------------------
-- The two helpers repeat 0012's rules exactly, so "could the name have made
-- a username?" and "is this the start of the email?" are asked the way the
-- old generator answered them. They live in pg_temp and go with the session.

create or replace function pg_temp.username_base_0012(source text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(translate(coalesce(source, ''), 'əƏıİöÖüÜçÇşŞğĞ', 'eEiIoOuUcCsSgG')),
          '[^a-z0-9_.]+', '_', 'g'
        ),
        '^[^a-z]+', ''
      ),
      '_{2,}', '_', 'g'
    ),
    '[_.]+$', ''
  );
$$;

-- Whether `username` is what 0012 would have made of this email: its start,
-- cut to 20 characters, or that with a number of 2 or more in place of the end.
create or replace function pg_temp.username_from_email(username text, email text)
returns boolean
language plpgsql
immutable
as $$
declare
  base text := left(pg_temp.username_base_0012(split_part(coalesce(email, ''), '@', 1)), 20);
  digits int;
begin
  if length(base) < 3 then
    return false;
  end if;

  if username = base then
    return true;
  end if;

  -- The number may run into digits the address already ends with, so every
  -- length of trailing digits is tried as the number.
  for digits in 1 .. coalesce(length(substring(username from '[0-9]+$')), 0) loop
    if right(username, digits)::bigint >= 2
      and username = left(base, 20 - digits) || right(username, digits) then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

do $$
declare
  pending record;
begin
  for pending in
    select id, full_name
    from public.profiles
    where length(pg_temp.username_base_0012(full_name)) < 3
      and pg_temp.username_from_email(username, email)
      -- Already one of the new fallbacks. Without this, an address that
      -- starts "student" would swap between "student" and "student2" on
      -- every run.
      and username !~ '^student[0-9]*$'
    order by created_at, id
  loop
    update public.profiles
    set username = generate_username(pending.full_name)
    where id = pending.id;
  end loop;
end;
$$;
