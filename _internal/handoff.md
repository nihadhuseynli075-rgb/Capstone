# Exampeak BugHunt v4 fix round (16 Nov 2026): handoff

## State
- Uncommitted on `master`, on top of `3fd3eaa` (= origin/master): 25 files changed, 4 added
  (`apps/api/src/modules/student/accountAge.ts` + `.test.ts`, `apps/web/src/features/auth/AgeCheck.tsx`,
  `supabase/migrations/0018_private_avatars.sql`; marked with `git add -N`). Nothing committed or pushed.
- Patch: `_internal/overhaul-2026-11-16.patch` (29 file diffs; `git apply --check -R` passes against the tree).
- Hooks: pre-commit = commit gate, pre-push = push gate (`push_gate.mjs status`: push gated, commit gated).
- `_internal/` is tracked in this public repo. This round added `_internal/` to `.git/info/exclude`, so the
  new patch file cannot be committed by accident. This handoff.md is tracked, so it shows as modified:
  leave it (and the rest of `_internal/`) out of the commit.
- Scope: only the IDs the coordinator listed from `_work/BugHunt_v4/reports/Nihad.md` (V4-01, V4-03 + V4-04,
  V4-05, V4-06, V4-08). V4-02 and V4-07 are left for you (below).

## What changed and why
- **V4-01 age check (H).** Accounts are for students aged 16 and over: one constant, `MIN_ACCOUNT_AGE = 16`
  in `packages/shared/src/index.ts`, read by the form, the API and the privacy/terms pages. Only the birth
  **year** is asked, so a year counts once everyone born in it has turned 16 (2009 or earlier in 2026; 2010
  from 1 Jan 2027).
  - Email sign-up: a "Year of birth" field after Name (`RegisterPage.tsx`). Too young: nothing is sent,
    what was typed is cleared, and a kind message offers the guest mode (`TooYoungNotice`). Old enough: the
    year goes in the sign-up metadata.
  - Every signed-in account without a recorded year (Google sign-ups, and every account made before this
    round) sees the year step first, on whatever page it lands (`AgeCheck.tsx`, gate in `App.tsx`). An email
    sign-up's year is sent from there without asking again.
  - The API records the year and the time it was given in the account's **app_metadata**
    (`modules/student/accountAge.ts`): only the secret key can write it, so a student cannot set it through
    Supabase, and **no migration is needed** for it.
  - The server refuses account features until the year is recorded: profile and friends routes answer 403
    `age-required` (`requireAccount.ts`; only `POST /api/profile/age` and deleting the account are exempt),
    tests and guest-history moves under an account key too (`isAuthenticatedStudent`), and an account
    without a year cannot be found by friend lookups (`friendRepository.ts`).
  - Under 16 at the year step: the API deletes the account at once with everything in it (photos, tests,
    account), the browser signs out, and the same kind message shows. A year once recorded is never
    changed, so a stolen token cannot get an account deleted.
  - Once Google has signed in to an account, a year in its sign-up metadata is ignored and the owner is
    asked (someone else may have signed up with that address first; see README on email confirmation).
  - Privacy and terms say how it works, in all three languages, with the figures filled from the constant
    (`legalText.ts`, `LegalPage.tsx`).
- **V4-03 + V4-04 Home header on phones.** At 640px and below the header has two rows: logo with language
  and theme, then Sign in and Create account side by side. No sideways scroll from 320 to 1440, and Sign in
  is visible on phones (`landing.css`).
- **V4-05 first screen.** `index.html` now draws Home's first screen (label, heading, intro, Start button,
  Sign in/Create account, the empty navy panel) before any JavaScript, in en/ru/az by the same choice as the
  app. A tiny inline script removes it for any other route, a saved Supabase session, or a sign-in coming
  back. The app removes it the moment its own page is ready (`App.tsx`), and on a crash (`ErrorBoundary.tsx`).
  No framework change.
- **V4-06 label contrast.** "GRADE 9 EXAM PREPARATION" is #926200 in the light theme: 4.79:1 (was 4.41:1).
  Dark theme unchanged (7.02:1).
- **V4-08 private photos.** The API now sends every profile photo (own profile, friends, requests) as a link
  signed for one hour (`signedPhotoUrls` in `services/profilePhotos.ts`), which works on the bucket as it is
  now and after it is made private. Migration `0018_private_avatars.sql` makes `avatars` private (**NOT
  APPLIED**). If signing ever fails, the stored address goes out instead (opens while the bucket is public;
  after 0018 the photo falls back to initials rather than failing the page).
- Tests: `scripts/supabase-standin.mjs` learned signed links, a private-bucket switch and admin-written
  app_metadata; `scripts/smoke-supabase.mjs` gained an age-step section and private-photo checks;
  `accountAge.test.ts` covers the rule's edges. Docs: README and `docs/deploy-render.md` migration range,
  `run-all.sql` now 0001-0018.

### Wording changes (old → new)
- Privacy, "What we keep" (en, and the same in ru/az): "With an account: your name, your email address,
  your username, …" → "…your email address, the year you were born and the date you told us, your
  username, …".
- Privacy, new section "Age" / "Возраст" / "Yaş" (3 paragraphs each): accounts are for {age}+ (born in
  {year} or earlier); younger students use the site without one; a younger Google sign-in is deleted as
  soon as they give their year.
- Terms, "Your account": "If you are not sure whether you may make an account, ask a parent or guardian
  first." → "You need to be {age} or older to have an account (born in {year} or earlier). If you are
  younger, you can use the site without one." (and the ru/az equivalents).
- Privacy and terms date: "14 October 2026" → "16 November 2026" (all three languages).
- New strings (en/ru/az) in `i18n.tsx`: `auth.birthYear`, `auth.birthYearHint`, `auth.errBirthYear`,
  `age.title`, `age.subtitle`, `age.notice`, `age.continue`, `age.saving`, `age.errFailed`,
  `age.tooYoungTitle`, `age.tooYoungBody`. The Russian and Azerbaijani wording is mine: **Nihad should
  check it.**
- `index.html` first screen: copies of existing landing strings only, no new wording.

## Checks
- Clean install `npm ci` pass; `npm run typecheck` pass; `npm test` 384/384 (was 374; 10 new);
  `npm run build` pass (warning "empty chunk: supabase" only when built without Supabase env, as before);
  `npm run smoke:supabase` 433/433 (was 406). The baseline on the untouched tree was all green too.
- `lint_repo.mjs`: 2 FAIL, 2 WARN, identical before and after (both FAILs are the hunt's dismissed false
  positives). `cleanup_scan`: 1 FAIL / 1 WARN, both the old "listening on http://localhost" startup log line in
  `apps/api/src/server.ts`, now in scope only because the file changed; not touched.
- Browser checks ran only against a local stack: `scripts/supabase-standin.mjs` (127.0.0.1), the API on
  4605 against it, and a production build on 4604. Nothing reached the real Supabase project; no real
  sign-up or sign-in. Evidence: `C:\Users\KHand\Crimson\qa-evidence\BugHunt_v4\Nihad\fixes\`
  (`v4-03-<width>.png`, `v4-06-label-*.png`, `v4-05-static-*.png`, `v4-01-*.png`, `cleanup\`).
  - Header: no sideways scroll at 320/360/375/390/414/640-767/768/1024/1440; Sign in visible on phones.
  - First screen, same gzip server and throttle (slow 3G, 390px, 3 runs): FCP/LCP 5.1 s → 3.4 s, CLS 0.001.
  - Age step: child year → account gone, session cleared, guest message; adult year → recorded, the page
    continues; sign-up form with a child's year → refused with no request sent.
  - Route sweep at 375 and 1440: all pages load, no console errors (the one 404 is a made-up result id, as
    before); JavaScript off still shows Home's first screen; keyboard order and focus fine.
- `npm ci` reports 7 vulnerabilities in the existing lockfile (2 moderate, 3 high, 2 critical); no
  dependency was changed this round.

## Before Herdy pushes
- [ ] What deploys from `master`: Render redeploys **both** services on every push (`exampeak-api` Web
      Service and `exampeak-web` Static Site; `docs/deploy-render.md`).
- [ ] **Confirm the threshold**: `MIN_ACCOUNT_AGE = 16` (house rule: guardian consent under 16) and the
      year-only rounding (born in 2010 counts as under 16 until 1 Jan 2027). Change it in one place only.
- [ ] **Existing accounts**: after the push, every existing account is asked its year on its next visit,
      and an answer under 16 deletes that account and its test history at once. Most current users are
      Grade 9 (14-15), so tell Nihad first and decide whether to warn students or export anything.
- [ ] Order: push (API + web redeploy), then run `supabase/migrations/0018_private_avatars.sql` in the
      Supabase SQL editor (**NOT APPLIED**). Until 0018 runs, photo addresses still open publicly (V4-08 not
      closed on the live site). If `SUPABASE_AVATAR_BUCKET` names another bucket, make that one private by hand.
- [ ] V4-02 not fixed: `contactAddress` stays `null` in `apps/web/src/lib/legalText.ts` until there is a real
      contact email and the privacy page can say who runs Exampeak.
- [ ] V4-07 not fixed: Render dashboard → `exampeak-web` → Redirects/Rewrites → `/*` → `/index.html`,
      action Rewrite (no `render.yaml` in the repo).
- [ ] Review/consent flags: n.a. (this app has no review mode). Media shipping: nothing new; the first
      screen uses the existing logo PNG only.
- [ ] Leave `_internal/` out of the commit.
- [ ] Suggested commit message: "fix: age check for accounts, private profile photos, Home first screen
      and phone header" (body: the five items above and the checks).

## Open
- Parent/guardian consent by email (not built this round): an option if under-16s should be able to have
  accounts. It needs a parent's address, a confirmation link, and a record of the consent.
- Accounts that never answer the year step keep their data (they can use nothing). Option: a periodic
  clean-up of such accounts after N days.
- `_internal/` (handoff notes, a 2,796-line patch, a 9.9 MB demo video) was committed to the public repo in
  `3fd3eaa`: decide whether to untrack it (`git rm -r --cached _internal`, then ignore it) and whether the
  history needs cleaning.
- All 30 live Russian Language questions were machine-translated (`supabase/seeds/REVIEW.md` flags them for
  Nihad's check; nothing records that he did).
- Rights to republish the DİM past papers, on the site and in the public repo's seeds, are not recorded.
- V4-05 is partly done: on emulated slow 3G the first screen still waits for the stylesheet (26 KB
  compressed), which shares the connection with the scripts (3.4 s, target 2.5 s).

---

# Handoff: Figma redesign rebuild (4 Nov 2026)

Branch: `master` (the feature branch was folded in and deleted). All changes are uncommitted in the working tree (the commit gate
blocks agent commits); `overhaul-2026-11-04.patch` beside this file is the same diff. Nothing is
pushed.

## Commit it

```bash
git add apps/web/package.json package-lock.json apps/web/src
git commit -F _internal/commit-message.txt
```

`CLAUDE.md` is git-ignored in this repo, so its new "Styles" note stays local.
`_internal/` is not ignored: leave these handoff files out of the commit, or delete them after.

## What changed

- `apps/web/src/styles/redesign.css` (new, loaded last in `main.tsx`): the Figma tokens and
  shared pieces, plus page sections for the builder, exam, results, dashboard, history, auth,
  profile and admin.
- `apps/web/src/styles/landing.css` and `pages/LandingPage.tsx` rewritten to the Figma landing.
- `TestBuilderPage.tsx`: a two-column wrapper and a summary title and note (new keys
  `builder.summaryTitle`, `builder.summaryNote` in en, ru and az).
- `ExamPage.tsx`: a visible title and count inside the question map.
- `ResultsPage.tsx`: sets `--score` for the ring.
- `icons.tsx`: `IconSpark`, `IconCheck`.
- `lib/i18n.tsx`: the landing headline in sentence case (en, ru, az), plus the two builder keys.
- `@fontsource-variable/inter` added to `apps/web`.

## Checked

`npm ci`, `npm run typecheck`, `npm test` (335 pass), `npm run build`,
`npm run smoke:supabase` (406 passed, 0 failed). The production preview was checked with
Playwright: 11 routes plus a full build → exam → results run at 375 and 1440, light and dark.
That is 48 checks with no console errors, no failed requests and no horizontal scroll. Screenshots
are in `~/Crimson/qa-evidence/Nihad-2026-11-04/cleanup/`.

## Not done

- **Phone tab bar from the Figma phone frames: not added, by decision (Herdy, 4 Nov 2026).** Phones
  keep the menu button. The Figma phone frames still show a tab bar; treat the menu as the
  source of truth.
- **Exam on phones:** the question map stays the scrolling strip the exam page already keeps in
  view. The 5-column grid is used on wide screens only.
- **Review cards on results** keep their coloured left edge for right and wrong answers.
