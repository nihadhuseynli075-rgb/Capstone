# Handoff: Figma redesign rebuild (4 Nov 2026)

Branch: `feat/figma-redesign`. All changes are uncommitted in the working tree (the commit gate
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
