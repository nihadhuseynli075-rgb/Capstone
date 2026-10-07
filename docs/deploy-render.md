# Deploying to Render

ExamPeak goes on Render as two services from the same GitHub repo:

| Service | Render type | What it runs |
| --- | --- | --- |
| `exampeak-api` | **Web Service** (Node) | `apps/api`, the Express API |
| `exampeak-web` | **Static Site** | `apps/web`, built by Vite into plain files |

Supabase stays where it is. Render only hosts the code; the database, storage
buckets and sign-in all stay in Nihad's Supabase project.

## Before you start

- Supabase is set up as in the README (`supabase/run-all.sql` run, Email
  provider on). **Do not deploy the API without Supabase credentials.** It
  would run in memory mode, and Render restarts services often (every deploy,
  and every time a free service wakes up), so every question and result would
  vanish.
- Someone with access to `github.com/nihadhuseynli075-rgb/Capstone` signs in
  to Render with GitHub and lets Render see that repo. Simplest is for Nihad to
  own the Render account, the same way he owns Supabase.
- Render deploys whatever is on `master` on GitHub, and redeploys on every push.
  Pushes still go through the push gate as usual.

## Step 1: the API (Web Service)

**New → Web Service**, pick the repo, then:

| Setting | Value |
| --- | --- |
| Name | `exampeak-api` |
| Branch | `master` |
| Root Directory | *(leave blank: the repo root)* |
| Runtime | Node |
| Build Command | `npm ci --include=dev` |
| Start Command | `npm --workspace apps/api exec -- tsx src/server.ts` |
| Health Check Path | `/health` |

Why these, in case they look odd:

- **The API is run with `tsx`, not built.** `tsc` output does not run in plain
  Node here (the imports have no `.js` extensions and `@grade9/shared` points at
  TypeScript source), and `tsx` is exactly what `npm run dev` already uses.
- **`--include=dev`** because `tsx` is a dev dependency, and `NODE_ENV=production`
  (below) would otherwise make npm skip dev dependencies.
- The repo root, not `apps/api`, so npm workspaces can link `@grade9/shared`.

**Environment** (the Environment tab, or during creation):

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `API_PORT` | `10000` |
| `SUPABASE_URL` | the project URL (Supabase → Project settings → API) |
| `SUPABASE_SECRET_KEY` | the **secret** key (Project settings → API keys) |
| `ADMIN_PASSWORD` | a real password. Blank keeps the admin dashboard shut in production |
| `WEB_ORIGIN` | `https://placeholder.invalid` for now; fixed in step 3 |
| `ANTHROPIC_API_KEY` | optional; without it, written questions are left out of tests |
| `SUPABASE_IMAGE_BUCKET` | optional, defaults to `question-images` |
| `SUPABASE_AVATAR_BUCKET` | optional, defaults to `avatars` |

`API_PORT` matters: the API reads `API_PORT`, not Render's `PORT`, and Render
expects the service on 10000 unless told otherwise.

Create it, wait for the deploy, then open
`https://exampeak-api.onrender.com/health` (your exact URL is at the top of the
service page). It must say:

```json
{"status":"ok","storageMode":"supabase"}
```

`"memory"` means the Supabase variables are missing or misspelt. Fix that
before going further.

## Step 2: the website (Static Site)

**New → Static Site**, same repo:

| Setting | Value |
| --- | --- |
| Name | `exampeak-web` |
| Branch | `master` |
| Root Directory | *(blank)* |
| Build Command | `npm ci --include=dev && npm --workspace apps/web run build` |
| Publish Directory | `apps/web/dist` |

**Environment:**

| Key | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `VITE_API_BASE_URL` | the API URL from step 1, e.g. `https://exampeak-api.onrender.com`, **no trailing slash** |
| `SUPABASE_URL` | the Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | the **publishable** key (never the secret key) |

These are baked into the files at build time, so changing one later needs a
redeploy (**Manual Deploy → Clear build cache & deploy**) to take effect.

No redirect or rewrite rules are needed: every route lives after the `#`
(`/#/admin`, `/#/profile`), so the server only ever serves `index.html`.

## Step 3: connect the two

1. Copy the static site's URL, e.g. `https://exampeak-web.onrender.com`.
2. On the **API**, set `WEB_ORIGIN` to exactly that: `https://`, no trailing
   slash, no path. The API compares it character for character and turns away
   every other browser origin in production. Saving redeploys the API.

## Step 4: tell Supabase where the site lives

Supabase → **Authentication → URL Configuration**:

- **Site URL**: the static site URL.
- **Redirect URLs**: add the static site URL (keep `http://localhost:*/**` for
  development).

Without this, password-reset emails, email-change links and Google sign-in send
people back to localhost. The Google Cloud console needs no change: its
redirect URI is Supabase's callback, which has not moved.

## Step 5: check it

On the live site:

- [ ] The landing page loads and the topic picker shows subjects (the API is reachable).
- [ ] `/#/admin` signs in with the new `ADMIN_PASSWORD` and shows no memory-mode banner.
- [ ] A test can be taken and submitted; it shows up in history after a refresh.
- [ ] Sign up with email; the confirmation link opens the live site, not localhost.
- [ ] Continue with Google (if switched on) lands on `/#/profile`.
- [ ] A profile photo uploads.

## Things to know

- **The free plan sleeps.** A free Web Service stops after 15 minutes with no
  traffic, and the next visitor waits about a minute while it wakes up. The
  static site never sleeps, so the page appears but the subjects take a while.
  Fine for a capstone demo; open the site a minute before showing it. The
  Starter plan (about $7 a month) stays awake.
- **Custom domain**: when one is bought, add it under each service's
  **Settings → Custom Domains**, then update `WEB_ORIGIN` on the API, the
  static site URL in Supabase (step 4), and, if the API gets its own domain,
  `VITE_API_BASE_URL` followed by a static site redeploy.
- **Logs** are under each service's **Logs** tab. A CORS failure shows up in
  the browser console as a blocked request and in the API log as
  `Origin ... is not allowed by CORS`: check `WEB_ORIGIN` first.
- **Secrets** live only in Render's Environment tab. Nothing is added to the
  repo, and `.env` stays gitignored.
