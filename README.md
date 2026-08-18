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
3. Set `ADMIN_PASSWORD` to something other than the default.
4. In the Supabase dashboard open **SQL Editor → New query**, paste
   [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql)
   and run it.
5. Restart the API. `GET /health` should now report `"storageMode": "supabase"`.

The service role key bypasses row level security, so it stays on the server.
Nothing in `apps/web` ever reads it, which is why every database call goes
through the API.

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

## Layout

```text
apps/
  web/                React app: student flow and admin dashboard
    public/           Logo and favicon
    src/
      app/            Shell and the hash router
      components/     Question entry form
      pages/          One file per screen
      services/       API clients
  api/                Express API
    src/
      routes/         HTTP endpoints
      services/       Generation, marking, spreadsheet import
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
- Light and dark mode

Not built yet:

- Student accounts. The browser generates a local key so history works without
  sign-in; real registration and login through Supabase Auth comes later.
- Friends and the community question board.
- AI-generated questions. Everything comes from the question bank for now.

See [docs/todo.md](docs/todo.md) for what is next and who is doing it.
