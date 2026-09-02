# Action list

Taken from the session on 18 August 2026. Next session: **Monday, 4:15-4:45pm**.

The target for that session is to walk through the admin dashboard together and
put a couple of real questions into it.

## Nihad

- [ ] **Two logo files.** One icon only (just the book/mountain mark), one with
      "ExamPeak" underneath. The icon-only version is the one a browser tab can
      actually render, since text disappears at that size. Placeholder versions
      are already in the app at `apps/web/public/logo-mark.svg` and
      `logo-wordmark.svg` - replace them with the final artwork.
- [ ] **Past-paper questions in a spreadsheet.** The more the better, but even
      five is enough to test with. Mostly text-only questions; one question with
      a picture is plenty for now to check that path works. Column format is in
      [question-format.md](question-format.md) - matching it means the whole
      sheet can be imported in one paste instead of retyped.
- [ ] **Decide the extra columns.** Paper year is in there already. Add school,
      country or anything else worth recording, or say it is not needed.
- [ ] **Confirm the real topic names** for Maths, English and Russian off the
      actual papers. The app does not need a code change for these - any topic
      typed into the admin form appears in the student's topic list right away.
- [ ] **Design references.** Screenshots of exam or study apps whose look you
      want, collected in the Google Doc.

## Herdy

- [x] Admin dashboard: password sign-in, add / edit / delete questions, form
      laid out like a survey form.
- [x] Bulk import so a Google Sheets export can be pasted in rather than typed
      one question at a time.
- [x] Question bank in the database, with the admin dashboard writing into it
      rather than anyone editing Supabase by hand.
- [x] Difficulty presets versus custom, as agreed: easy/medium/hard each set the
      question count and timer, custom lets the student pick both, plus a no-timer
      option.
- [x] Exam-style flow: sit the whole test, then see score, mistakes, explanations
      and statistics at the end. No feedback between questions.
- [x] Test history with a best-result comparison.
- [ ] Connect the real Supabase project. The URL and anon key came through on
      Crimson chat; the API also needs the service role key. Until that is in
      `.env`, everything runs in memory and is lost on restart.
- [ ] Run `supabase/migrations/0001_initial_schema.sql` in the Supabase SQL
      editor.
- [ ] Walk Nihad through the code flow in the next session.

## Agreed for later

- **Friends**: friend list, adding friends, comparing progress. In Nihad's page
  plan, not built yet.
- **Community questions**: users posting their own questions, possibly unlocked
  as a reward for scoring full marks. Agreed as an extension once the core app is
  tested.
- **Student accounts**: registration and login through Supabase Auth. Right now
  the browser generates a local key so history works without sign-in.
- **exampeak.app**: available at about $8/year. Agreed to buy once the project is
  80-90% done.
- **Settings**: light/dark mode is built and in the header. Changing name and
  password comes with real accounts.

## Open questions

- Do the difficulty presets feel right? Easy is 10 questions in 15 minutes,
  medium 25 in 30, hard 50 in 50. All three are one line each in
  `packages/shared/src/index.ts` if they need changing.
- Short answers are marked ignoring capitals and extra spaces, but nothing more
  clever than that. Worth deciding whether near-misses and spelling should count,
  especially for Russian and English.
