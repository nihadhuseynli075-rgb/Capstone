-- Exampeak: the age check for new accounts.
--
-- Run this in the Supabase SQL editor only once the API and the web app from
-- the same commit as this file are both deployed, and never while an older
-- API may still be serving. It does not need 0018_private_avatars.sql first.
-- Running it is what switches the check on: accounts made from that moment
-- are asked their year of birth; every account made before it is left
-- exactly as it is.
--
-- From the bug hunt of 16 November 2026 (V4-01, round 2).
--
-- Every statement here is safe to run twice.

-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- Accounts are for students of MIN_ACCOUNT_AGE (16) and over
-- (packages/shared). New email sign-ups give their year on the form. A new
-- Google account gives it on its first sign-in, and until then the API uses
-- nothing of it (apps/api/src/modules/student/accountAge.ts).
--
-- Accounts that already exist are not asked, locked or deleted: the decision
-- for them is still to be made. The API tells them apart by when Supabase
-- made the account (auth.users.created_at) against `age_checks.checks_from`,
-- the moment this file first ran. Before it has run there is no such moment,
-- and the API asks nobody.
--
-- `age_decisions` holds the one answer each new account gives. Its primary
-- key is what makes that answer final: of two answers sent at once, the first
-- row in wins, and the other request reads it and follows it, so an account
-- can never be both kept and deleted. The year is also copied into the
-- account's app_metadata, which every access token carries. A refused
-- account is deleted, and its row goes with it (on delete cascade), so
-- nothing is kept about a student too young to have an account. One that
-- already holds tests, friends or a photo is not deleted but locked, and
-- keeps its 'refused' row until someone has looked at it: any 'refused'
-- row left in this table is such an account.
--
-- Neither table has a policy: only the API reads and writes them, with the
-- secret key. The public key, and a signed-in student's own token, can do
-- neither.

create table if not exists age_checks (
  -- One row only.
  id boolean primary key default true check (id),
  checks_from timestamptz not null default now()
);

-- The first run sets the moment; running this again keeps it.
insert into age_checks (id) values (true) on conflict (id) do nothing;

create table if not exists age_decisions (
  account_id uuid primary key references auth.users (id) on delete cascade,
  birth_year int not null,
  outcome text not null check (outcome in ('confirmed', 'refused')),
  decided_at timestamptz not null default now()
);

alter table age_checks enable row level security;
alter table age_decisions enable row level security;

revoke all on age_checks from anon, authenticated;
revoke all on age_decisions from anon, authenticated;

comment on table age_checks is
  'When the age check for new accounts began. Accounts made before it are not asked their year of birth.';
comment on table age_decisions is
  'Each new account''s answer to the year-of-birth step: the first one in is final. API only.';
