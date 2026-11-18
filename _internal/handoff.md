# Handoff — 18 Nov 2026 follow-ups (uncommitted)

The commit gate blocks agent commits here, so these 16 files are left for you
to commit. The same changes are in `_internal/overhaul-2026-11-18.patch`.

## Commit 1 (feature)

Files: apps/api/src/repositories/attemptRepository.ts, apps/api/src/routes/tests.ts,
apps/web/src/lib/examSession.ts, apps/web/src/lib/i18n.tsx, apps/web/src/pages/ExamPage.tsx,
apps/web/src/pages/HistoryPage.tsx, apps/web/src/pages/MakeTestPage.tsx,
apps/web/src/pages/ResultsPage.tsx, apps/web/src/services/testsApi.ts,
apps/web/src/styles/redesign.css, docs/todo.md, packages/shared/src/index.ts,
scripts/smoke-supabase.mjs

```
feat: name student-made tests in history and results, guard unsaved test edits

- History rows and reopened results show a student-made test's own title
  under its subject (looked up by test_attempts.student_test_id; a deleted
  test falls back to the subject). The fresh result's heading uses it too.
- The test maker asks before leaving with unsaved changes (the router's
  leave guard and the browser's own prompt on close or reload).
- Picture uploads that are refused (not a picture, over 2 MB) are worded in
  the site language instead of the API's English.
- docs/todo.md: the two 11 Nov items checked in the browser are ticked.

Verified: typecheck, 401 unit tests, build, smoke 206/206, smoke:supabase
503/503 (two new history-title checks), and in the browser on the stand-in
stack: upload a real and a fake picture, leave guard, save, sit, history.
```

## Commit 2 (cleanup)

Files: apps/api/src/routes/admin.ts, apps/web/src/pages/FriendPage.tsx,
apps/api/src/services/studentTests.test.ts

```
cleanup(student-tests): heading on every friend page state, odd-input test, unused import

- FriendPage has an h1 when signed out, on a bad link and while loading or
  failing, not only once the friend has loaded.
- studentTests.test.ts: emoji, accents and Cyrillic pass checkDraft; the
  title, prompt and option-count limits are refused in words.
- routes/admin.ts: randomUUID was left unused when the picture upload moved
  to services/questionImages.ts.

Verified: typecheck, 401 unit tests, build, both smoke suites, production
preview route sweep (15 routes, no console errors).
```

## Deploy steps, in order

1. Push (your standalone "push", through the push gate).
2. Deploy the API.
3. Run `supabase/migrations/0020_student_tests_and_reports.sql` (or
   `run-all.sql`) in the Supabase SQL editor.
4. Deploy the web app.
5. On the live site: make a test, share it with a friend account, sit it,
   report a question, and check Reported questions in the admin dashboard.

Evidence: `~/Crimson/qa-evidence/Nihad-2026-11-18/cleanup/` (18 screenshots).
