# ExamPeak

Grade 9 mock test practice. Students build a test from real past-paper
questions, sit it start to finish, and get their score, their mistakes and the
reason behind every one of them at the end.

The name is the book and the mountain: **Exam** and **Peak**.

## Running it

```bash
npm install
npm run dev
```

That starts the API on <http://localhost:4000> and the web app on
<http://localhost:5173>.

The app runs with no configuration at all. Without Supabase credentials it keeps
questions and results in the API's memory, which is fine for trying things out
but is lost the moment the API restarts. The API says so at startup and the admin
dashboard shows a banner, so this is never a silent surprise.

## Connecting Supabase

1. Copy `.env.example` to `.env` at the repository root.
2. From the Supabase dashboard, **Project settings → API**, copy the project URL
   and the **service role** key into `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`.
3. Copy the **anon** key into `VITE_SUPABASE_ANON_KEY` and the same project URL
   into `VITE_SUPABASE_URL`. The browser needs these for sign-in. The anon key
   is safe to ship; row level security decides what it can reach, and the
   question bank has no anon policy at all.
4. Set `ADMIN_PASSWORD` to something other than the default. Leaving it blank
   in development means the built-in default; in production it means the admin
   dashboard stays shut, because that default is written in the repository for
   anyone to read.
5. In the Supabase dashboard open **SQL Editor → New query**, paste
   [`supabase/run-all.sql`](supabase/run-all.sql), and run it. The script applies
   migrations `0001` through `0007` in order and is safe to rerun when an older
   project already has some of them. If `0001`-`0006` are already in, running
   [`0007_profiles_and_google.sql`](supabase/migrations/0007_profiles_and_google.sql)
   on its own is enough: it adds profile photos and the `avatars` storage bucket.
6. Under **Authentication → Providers**, make sure Email is enabled. Google is
   optional and has its own steps, below.
7. Restart the API. `GET /health` should now report `"storageMode": "supabase"`.

The service role key bypasses row level security, so it stays on the server.
Nothing in `apps/web` ever reads it, which is why every database call goes
through the API.

## Signing in with Google

The **Continue with Google** button on the sign-in and sign-up pages works as
soon as Google is switched on in Supabase; there is no code or key to add to
this repository. Until then the button says Google is not switched on yet,
rather than sending anyone to an error page.

1. In the [Google Cloud console](https://console.cloud.google.com/), set up the
   OAuth consent screen (app name "Exampeak", a support email, audience
   External), then create an **OAuth client ID** of type **Web application**.
2. Under **Authorized redirect URIs**, add the callback URL that Supabase shows
   on its Google provider panel. It looks like
   `https://<project-ref>.supabase.co/auth/v1/callback`.
3. In Supabase, **Authentication → Sign In / Providers → Google**: switch it on
   and paste in the client ID and client secret from step 1.
4. In Supabase, **Authentication → URL Configuration**: set **Site URL** to where
   the site is served (`http://localhost:5173` while developing), and add the
   deployed address and `http://localhost:*/**` to **Redirect URLs**. The
   wildcard port matters: Vite quietly moves to 5174 when 5173 is busy, and a
   redirect address that is not on this list is ignored in favour of the Site
   URL, which sends the sign-in back to whatever is running there instead.
5. For the **Connect Google** button on the profile page, which adds Google to
   an account made with an email and password, also switch on **Allow manual
   linking** under **Authentication → Sign In / Providers**. Without it the
   profile page says connecting is not switched on; signing in with Google
   still works.
6. Leave **Confirm email** on, under **Authentication → Sign In / Providers →
   Email**. See the warning below.

Someone who signs in with Google using the same address as an existing email
account is signed into that account, not given a second one: Google addresses
are verified, so Supabase links the two by itself.

**That is also why email confirmation has to stay on.** Supabase only protects
this joining-up while the existing account is unconfirmed, by throwing away its
password first. With confirmation off, every sign-up counts as confirmed
straight away, so somebody could register a classmate's Gmail address with a
password of their own, wait for that classmate to press **Continue with
Google**, and still be holding a password to the account they land in.

Google returns a one-time code rather than the session itself, because the app
asks for the `pkce` flow (`apps/web/src/lib/supabaseClient.ts`). The code is
worth nothing without the matching secret this browser kept, and it is taken
out of the address as soon as it has been used, so no token is left in the
address bar or in the browser's history for the next person on a shared
computer. Failures still come back in the fragment, and the app's own routes
live in the fragment too, so Google always returns to the site's bare address
and the app sends the student on to their profile from there (see
`apps/web/src/features/auth/oauthRedirect.ts`).

## Profiles

Signed-in students have a profile at `/#/profile`, and signing in with Google
lands there. It shows their photo, name, email and when they joined, and lets
them:

- upload, replace or remove a profile photo (cropped to a square and shrunk in
  the browser before it is sent, which also strips the camera's location data);
- change their name;
- set or change their password;
- connect or disconnect Google;
- delete their account, which also deletes their photo and every test they
  have taken, after typing their email address to confirm.

The name and photo live in the `profiles` table and only the API writes them.
The copy on the Supabase account is not used, because every Google sign-in
overwrites it with Google's name and photo. Changing the name, the photo and
deleting the account all need the API connected to Supabase with the service
role key; without it the profile page says so and leaves the rest working.

## The two sides of the app

**Students** (`/`) pick a subject, topics, and either a difficulty or their own
length and timer, then sit the test. Nothing is revealed until they submit.

**Admins** (`/#/admin`) sign in with a shared password and manage the question
bank: add questions one at a time through a form, or paste a whole spreadsheet
export at once. See [docs/question-format.md](docs/question-format.md) for the
column format.

## Testing

```bash
npm run typecheck
npm run build
```

With the API running, the end-to-end check walks the full flow — admin sign-in,
question CRUD, spreadsheet import, generating a test, marking it, history and
the personal-best comparison:

```bash
npm run smoke
```

The Supabase code paths - accounts, moving guest history, two submissions of
one paper at once, recovering from a write that fails halfway, and profiles
(photos, renaming, deleting an account and everything in it) - only run with
Supabase connected. This starts a local stand-in for Supabase's REST, auth and
storage APIs, points a fresh API at it, and checks them, with no project needed:

```bash
npm run smoke:supabase
```

The stand-in is not Supabase: row level security and the migration SQL are
only proven against a real project. It does play Google, though, so the whole
Google sign-in can be tried in a browser without a Google project; the comment
at the top of [`scripts/supabase-standin.mjs`](scripts/supabase-standin.mjs)
says how.

## Layout

```text
apps/
  web/                React app: student flow and admin dashboard
    public/           Logo and favicon
    src/
      app/            Shell and the hash router
      components/     Question entry form
      features/       Accounts: sign-in (email and Google) and the profile page
      pages/          One file per screen
      services/       API clients
  api/                Express API
    src/
      routes/         HTTP endpoints
      services/       Generation, marking, spreadsheet import, profile photos
      repositories/   Supabase reads and writes, with in-memory fallback
      modules/admin/  Admin sign-in
packages/
  shared/             Types and rules both sides agree on
supabase/
  migrations/         Database schema
docs/                 Product notes, action list, spreadsheet format
scripts/              End-to-end smoke test
```

## Where things stand

Built and working:

- Question bank with an admin dashboard writing into it
- Spreadsheet import with per-row error reporting
- Difficulty presets and a custom mode, including an untimed option
- Exam-style test flow: everything revealed only at the end
- Automatic marking, explanations, per-topic breakdown
- Test history and a best-result comparison that accounts for difficulty
- Student accounts: registration and sign-in, with email or with Google
- A profile page: photo, name, password, connecting Google, and deleting the
  account with everything in it
- Guest history is moved onto the account the first time someone signs in
- Site language in English, Russian and Azerbaijani
- Light and dark mode

Not built yet:

- Friends and the community question board.
- AI-generated questions. Everything comes from the question bank for now.

See [docs/todo.md](docs/todo.md) for what is next and who is doing it.
