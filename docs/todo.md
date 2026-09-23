# Action list

Taken from the session on 18 August 2026. Next session: **Monday, 4:15-4:45pm**.

The target for that session is to walk through the admin dashboard together and
put a couple of real questions into it.

## Nihad

- [x] **Two logo files.** Delivered on 9 September: the icon on its own, the
      icon with "Exampeak" beside it, and the icon with the name underneath.
      All three are in the app.
- [ ] **The logo as vector files, if they exist.** The artwork arrived as
      images, so the versions in the app are traced from them by hand. They are
      close but not exact - the channels on the right face and the curl at the
      summit are eyeballed. If the designer has the original `.svg` or `.ai`,
      dropping it in is a straight swap of
      `apps/web/public/logo-mark.svg` and `logo-wordmark.svg`, plus the paths in
      `apps/web/src/lib/brand.tsx`, which is where the app draws it inline.
- [ ] **The wordmark's typeface.** The name is set in the app's own font rather
      than whatever the artwork uses. Worth naming it so the two match.
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
- [ ] Run `supabase/migrations/0007_profiles_and_google.sql` too (or the whole
      of `supabase/run-all.sql`). The profile page needs it for photos, and it
      stops Google sign-ins from overwriting a name a student has changed.
- [ ] Switch on Google sign-in: an OAuth client in Google Cloud, pasted into
      Supabase, plus the redirect URLs and "Allow manual linking". Steps are in
      the README under "Signing in with Google". The button already explains
      itself until this is done.
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
