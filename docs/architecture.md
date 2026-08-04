# Architecture

## High-Level Flow

1. Student signs in through Supabase Auth.
2. Student chooses subject, topic, difficulty, question type, question count, and time limit.
3. Web app sends settings to the API.
4. API asks the AI generation module for exam-style questions.
5. API saves the generated test attempt and questions in Supabase.
6. Student completes the test in the web app.
7. API marks answers, stores the result, and returns explanations.
8. Dashboard reads previous attempts and highlights weak topics.

## Boundaries

- `apps/web` owns the student interface.
- `apps/api` owns AI generation, marking, persistence, and protected server logic.
- `packages/shared` owns shared TypeScript contracts used by both apps.
- `supabase` owns database migrations and future seed data.

## Suggested Build Order

1. Connect Supabase Auth and profile creation.
2. Store static sample questions before adding real AI generation.
3. Build the test-taking screen and submit flow.
4. Add results explanations and topic performance.
5. Add history and dashboard charts.
6. Replace sample generation with a real AI provider call.
