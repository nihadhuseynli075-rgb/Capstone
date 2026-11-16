-- Exampeak: profile photos in a private bucket.
--
-- Run this in the Supabase SQL editor after
-- 0017_passages_and_multiple_answers.sql. It changes only the `avatars`
-- bucket that 0007 made.
--
-- From the bug hunt of 16 November 2026 (V4-08).
--
-- Every statement here is safe to run twice.

-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- 0007 made `avatars` a public bucket, so a student's photo could be opened
-- by anyone who had its address, for ever: an address copied out of the page,
-- left in a browser's history, or passed on. Most students are 14 or 15.
--
-- From now on the API hands out each photo as a link signed for an hour
-- (signedPhotoUrls in apps/api/src/services/profilePhotos.ts), and a private
-- bucket opens nothing without one. Signed links work on a public bucket too,
-- so the API does this both before and after this file is run: deploy the API
-- first, then run this.
--
-- The photos already in the bucket stay where they are, and the profiles keep
-- their addresses, which the API reads to know which file to sign. Only the
-- bare addresses stop opening. The size and type limits are 0007's, kept.
--
-- There are still no storage policies, as 0007 explains: the API reads and
-- writes with the secret key, which passes them, and with none the public key
-- can neither list the bucket, nor read from it, nor write to it.
--
-- Rerunning 0007 on its own makes the bucket public again (its insert sets
-- `public` back to true); run-all.sql runs this after it, which leaves it
-- private. A bucket of another name, chosen with SUPABASE_AVATAR_BUCKET, is
-- not touched here: switch off "Public bucket" under Storage -> the bucket ->
-- Edit bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
