# Architecture

## The two flows

Questions travel one way, from an admin into the bank, then out to students.
That direction is the thing to hold onto; everything else follows from it.

### Getting questions in

```text
Past paper (PDF)
  -> typed or extracted into a spreadsheet
  -> pasted into the admin dashboard, or entered one at a time in the form
  -> API validates it
  -> questions table in Supabase
```

Nothing writes to the database by hand. Everything goes through the admin
dashboard so the rows come out consistent: same subjects, same difficulty
values, correct answers that actually match one of the options. The importer
rejects rows that fail those checks and reports the spreadsheet row number, so a
bad cell is easy to find and does not block the other forty rows.

### Getting questions out

```text
Student picks subject, topics, and difficulty (or custom length and timer)
  -> API draws matching questions from the bank at random
  -> answers and explanations are stripped, then the test is sent
  -> the attempt and its questions are recorded straight away
  -> student answers everything, then submits
  -> API marks it, saves the answers, returns score + mistakes + explanations
  -> history and the personal-best comparison read from past attempts
```

## Why it is split this way

**The API holds the answers.** The student's browser is never sent
`correctAnswer` or `explanation` while a test is in progress; they only arrive in
the response to a submit. Marking on the server is what makes that possible. The
Supabase service role key lives on the server for the same reason, and the
question bank has no row level security policy for anonymous readers at all, so
the only route to a question is through an endpoint that strips the answer.

**Attempts snapshot their questions.** `attempt_questions` copies the prompt,
options, answer and explanation rather than only pointing at the bank. Editing a
typo in a question next month must not silently rewrite what somebody saw and
was marked on last month.

**Storage is swappable.** The repositories in `apps/api/src/repositories` talk to
Supabase when it is configured and to an in-memory store when it is not, behind
the same functions. That keeps the app runnable before credentials exist, and it
keeps every database call in two files instead of scattered through the routes.
The mode is reported by `/health` and shown in the admin dashboard, because
storage that silently forgets things would be worse than storage that refuses.

**Topics are data, not code.** The real topic names are still being read off the
past papers. Rather than hard-code a list, `/api/catalog` merges the starter
topics with every topic that actually appears in the bank. Entering a question
under a new topic makes it selectable by students immediately.

## Boundaries

- `apps/web` is the interface, both student and admin. It holds no secrets and
  makes no database calls.
- `apps/api` owns marking, persistence and anything that must not be trusted to
  the browser.
- `packages/shared` holds what both sides must agree on: the difficulty presets,
  the question shape, the answer-normalising rule, and the formula that ranks a
  best attempt. Defining these once is what stops the two sides drifting.
- `supabase/migrations` is the schema.

## Decisions worth remembering

**Difficulty or custom, never both.** Easy, medium and hard each carry a question
count and a timer. Custom means the student sets the count and the timer
themselves, and can turn the timer off. Offering difficulty *and* separate count
and timer controls would have been three ways to say the same thing.

**Everything at the end, not per question.** This is an exam, so nothing is
revealed until the whole paper is submitted. A per-question quiz mode would be a
different mode, not a tweak to this one.

**Best attempt is weighted.** A 10/10 easy test should not outrank 45/50 hard, so
attempts are ranked by percentage weighted for difficulty and test length rather
than raw percentage. The formula is `attemptScoreValue` in the shared package.

**Short-answer marking is deliberately dumb.** It ignores capitals and extra
spaces, and nothing else. Anything cleverer starts marking wrong answers correct,
which is worse than being strict.

## Build order from here

1. Load the real past-paper questions through the admin dashboard.
2. Supabase Auth for students, replacing the local browser key. The migration
   path is already in the schema: attempts carry both `student_key` and a
   nullable `student_id`.
3. Friends and progress comparison.
4. The community question board.
5. AI-generated questions, if the bank alone turns out not to be enough.
