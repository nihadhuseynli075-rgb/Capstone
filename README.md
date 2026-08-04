# Grade 9 AI Mock Tests

Starter code for an AI-powered website that generates personalized Grade 9 mock tests, gives immediate scoring feedback, and tracks student progress.

This repo is intentionally structured more than implemented. It gives the project a clean foundation without locking in every feature too early.

## Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, TypeScript
- Database/Auth: Supabase
- Shared contracts: TypeScript types in `packages/shared`

## Folder Structure

```text
apps/
  web/                  React app for students
  api/                  Node API for test generation, marking, and progress
packages/
  shared/               Shared TypeScript types and constants
supabase/
  migrations/           Database schema starter
docs/
  product-one-pager.md  Product notes and MVP scope
```

## Getting Started

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in Supabase/API values when you are ready to connect real services.

## Current Starter Scope

Implemented as placeholders:

- Subject/topic/difficulty selection UI
- Test generator API route
- Mock submit/marking API route
- Shared types for subjects, questions, attempts, and performance
- Supabase starter schema

Not implemented yet:

- Real AI question generation
- Supabase authentication
- Persisted test history
- Charts and progress dashboard
- Full automatic marking for every question type
