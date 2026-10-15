-- Exampeak: size and type limits on the question pictures bucket.
--
-- Run this in the Supabase SQL editor after
-- 0014_answers_and_leaderboard_privacy.sql. It changes only the
-- `question-images` bucket that 0001 made.
--
-- From the bug hunt of 14 October 2026. Nothing the API does changes.
--
-- Every statement here is safe to run twice.

-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- The admin dashboard uploads question diagrams to this bucket, and 0001 made
-- it with no limits of its own. The API checks every picture before storing
-- it: 2 MB at most, and only a real PNG, JPG or WebP, read from the file's
-- own first bytes rather than its name (see the image route in
-- apps/api/src/routes/admin.ts). Those checks were the only ones there were.
-- An upload that got past them, or one made with the secret key from
-- anywhere else, could be any size and any type, and the bucket is public,
-- so whatever lands in it is served to whoever asks for it.
--
-- So the bucket gets the same limits the API holds a picture to, as 0007 gave
-- `avatars`: 2 MB (2097152 bytes), and only the three types the API stores a
-- picture as. It stays public, as 0001 made it, so a question's picture is an
-- ordinary image address. Pictures already in the bucket are left alone: the
-- limits apply to what is uploaded from now on.
--
-- A bucket of another name, chosen with SUPABASE_IMAGE_BUCKET, is not
-- touched here. Give it the same limits under Storage -> the bucket -> Edit
-- bucket.
--
-- Rerunning this puts the bucket's settings back to these.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
