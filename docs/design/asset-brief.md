# ExamPeak asset brief (prompt for a design / image-generation agent)

Copy everything below the line into the other agent. Attach two images with it:
the style reference (the three-phone mockup) and `apps/web/src/assets/exampeak-logo.png`.

---

You are designing the visual assets for **ExamPeak**, a free mock-test site for Grade 9
students in Azerbaijan preparing for their final exams. Students pick a subject, build a
practice test from real past-paper questions, sit it, and get marked results with
explanations and progress over time. The product exists as a **web app** (desktop and
tablet) and is getting a **mobile app design** (iOS/Android phone). Produce one
consistent asset set that serves both.

## Style direction

Follow the attached three-phone reference for mood and layout language:

- Clean, bright, mostly-white UI with **soft neumorphic cards**: very light grey
  background, white rounded cards (16–20px radius), wide soft shadows, no hard borders.
- A **solid brand-blue header with a large curved/rounded bottom edge** on the home
  screen, carrying a friendly greeting ("Hey, what would you like to study today?").
- **Colourful, circular, flat-with-subtle-depth subject icons**, each sitting on its own
  pastel or coloured disc, centred in a square card with the label underneath.
- Pill-shaped segmented tabs, small circular icon buttons (search, notifications, back).
- A spot illustration in the top-right of subject detail screens (like the chemistry
  flask in the reference), in the same flat style as the icons.
- Tone: calm, encouraging, modern and not childish. It is aimed at 14–15-year-olds.

## Brand

- **Logo (keep it; do not redesign from scratch):** a blue mountain peak whose right
  slope curls over into the pages of an open book, with three white page lines. It means
  "reach your peak through study". The wordmark is "Exampeak" in a bold geometric sans,
  navy. Refine it into clean vectors and deliver the lockups listed below.
- Colours (must be used exactly):
  - Peak blue `#0C82C8` (primary)
  - Wordmark navy `#0A3A58` (text, dark accents)
  - Soft blue `#E0EEFA`, page background `#F4F8FC`, surface `#FFFFFF`
  - Success `#1C8A5B`, danger `#C0392B`, warning `#9A6700`
  - Dark mode: background `#07202F`, surface `#0D2E44`, primary `#3AA6E6`, text `#E4F1FA`
- Subject icons may add one accent colour each, harmonised with the blues. Suggested:
  Mathematics = orange, English = purple, Russian = red/crimson. Keep saturation
  consistent across the set.
- Tagline: "Reach your peak."

## Hard constraints

1. **No text baked into any illustration or icon.** The app runs in English, Russian and
   Azerbaijani, so all words are live UI text. The logo wordmark is the only exception.
2. Every icon and illustration must work on **both light and dark backgrounds**. Deliver
   a dark-mode variant wherever the light one would lose contrast.
3. Vector first: **SVG** master for every logo, icon and spot illustration, plus **PNG
   @1x/@2x/@3x** with transparent backgrounds. Photographic or hero images as **WebP and
   PNG**.
4. Icons must stay legible at **24px** (list rows) and look rich at **64–96px** (grid cards).
5. No stock-photo realism, no real people's faces, no third-party logos or exam-board
   branding.
6. Keep file sizes small: SVG under 20 KB each where possible, hero images under 300 KB.

## Deliverables

### 1. Logo system
- `logo-mark` (peak only, square-safe), `logo-horizontal` (mark + wordmark),
  `logo-stacked` (mark above wordmark).
- Each in: brand colour, all-white (for blue headers), and navy mono.
- App icon: peak mark on a peak-blue rounded square, iOS 1024×1024 and Android
  adaptive icon (foreground + background layers, 432×432).
- Favicon set: 16, 32, 48 px, `favicon.svg`, Apple touch icon 180×180.
- Social share image 1200×630 (logo + tagline area left empty for live text is fine).

### 2. Subject icons (circular, reference style)
Mathematics, English, Russian. Also make ahead-of-time ones for likely future subjects:
Azerbaijani language, Physics, Chemistry, Biology, History, Geography, Computer
Science. Each as a coloured disc with a simple object (e.g. compass and ruler for maths,
open book with "Aa"-like shapes but no real letters for English, a matryoshka-inspired
or quill motif for Russian).

### 3. Topic icons (small, line-plus-fill, 24–32px)
Algebra, Geometry, Functions and Graphs, Probability and Statistics, Grammar,
Vocabulary, Reading Comprehension, Writing, Spelling, Punctuation.

### 4. Feature / action icons (same family)
New test, Past-paper questions, Quiz challenge, History, Results, Profile, Settings,
Friends, Leaderboard, Search, Notifications, Back, Menu, Language, Light/dark theme,
Timer, Flag question, Correct, Incorrect, Explanation/lightbulb, Difficulty (easy,
medium, hard as 1–3 bars or peaks), Upload/import (admin), Sign in with Google button
glyph area left neutral (do not draw the Google logo).

### 5. Illustrations (flat, same style as the reference flask)
- **Hero**: a stylised mountain peak with a student figure (faceless or from behind)
  climbing a path made of book pages or test sheets toward a flag. Web: 1600×1000 wide
  crop. Mobile: 1080×1350 portrait crop. Leave calm space on one side for live text.
- **Subject spot illustrations** (top-right of subject screens, ~240×240): one per subject
  in section 2.
- **Empty states** (~320×240): no tests taken yet, no history, no friends yet, no search
  results, offline/error.
- **Results moods**: great score (summit with flag), good score (halfway up), keep
  practising (base camp with a tent). Encouraging, never shaming.
- **Onboarding** (mobile, 3 screens, ~1080×1080): pick a subject; practise real past
  papers; track your progress to the peak.
- **Sign in / register** side panel for web (~800×1000) and small header art for mobile.

### 6. Screen mockups (to show how the assets are used)
Design the following at **mobile 390×844** and **web 1440×900** (plus one tablet 768
example of the home screen), light mode, then dark mode for home and results:

1. Landing / welcome (hero, "Start a practice test", "No account needed", subject shortcuts)
2. Sign in / Register (email and Google)
3. Home / dashboard (blue curved header with greeting, subject grid, recent result, streak)
4. Subject detail (spot illustration, topic list rows with arrow buttons, "Question paper
   with answers" and "Quiz challenge" cards, as in the reference)
5. Test builder (choose topics, difficulty easy/medium/hard/mixed, number of questions)
6. Exam screen (question card, multiple-choice options, short-answer input, progress
   bar, timer, next/previous, flag)
7. Results (score ring, per-topic breakdown, personal best comparison, review answers
   with explanations)
8. History (list of past attempts with score chips and trend chart)
9. Profile (photo, name, linked Google account) and Settings (language, theme)
10. Admin question bank (web only: table, add question form, spreadsheet import)

Mobile uses a bottom tab bar (Home, New test, History, Profile). Web uses a top header
with the horizontal logo, nav links, language picker and theme toggle.

## File naming and hand-off

```
exampeak-assets/
  logo/        logo-mark.svg, logo-horizontal-white.svg, app-icon-1024.png, favicon.svg ...
  icons/subjects/   subject-math.svg, subject-english.svg ...
  icons/topics/     topic-algebra.svg ...
  icons/ui/         ui-timer.svg, ui-flag.svg ...
  illustrations/    hero-web.webp, hero-mobile.webp, empty-history.svg, result-summit.svg ...
  mockups/mobile/   01-landing.png ... (light and -dark variants)
  mockups/web/      01-landing.png ...
  README.md         colour tokens, icon grid/stroke rules, and where each asset is used
```

Use lowercase kebab-case names. Keep one consistent icon grid (24px, 2px stroke where
strokes are used, 2px corner radius) and document it in the README.
