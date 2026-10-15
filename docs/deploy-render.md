# Deploying to Render

ExamPeak goes on Render as two services from the same GitHub repo:

| Service | Render type | What it runs |
| --- | --- | --- |
| `exampeak-api` | **Web Service** (Node) | `apps/api`, the Express API |
| `exampeak-web` | **Static Site** | `apps/web`, built by Vite into plain files |

Supabase stays where it is. Render only hosts the code; the database, storage
buckets and sign-in all stay in Nihad's Supabase project.

## Before you start

- Supabase is set up as in the README (`supabase/run-all.sql` run, which is
  migrations 0001 to 0015, and the Email provider on). **Do not deploy the
  API without Supabase credentials.** It would run in memory mode, and Render
  restarts services often (every deploy, and every time a free service wakes
  up), so every question and result would vanish.
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
| `TRUST_PROXY` | `1` |
| `GEMINI_API_KEY` | optional; without it, written questions are left out of tests |
| `SUPABASE_IMAGE_BUCKET` | optional, defaults to `question-images`. Migration 0015 sets the size and type limits on that bucket only; give one of another name the same limits in Supabase |
| `SUPABASE_AVATAR_BUCKET` | optional, defaults to `avatars` |

`API_PORT` matters: the API reads `API_PORT`, not Render's `PORT`, and Render
expects the service on 10000 unless told otherwise.

`TRUST_PROXY=1` matters too. Every request reaches the API through Render's
proxy, and without it the API sees them all as coming from one address. The
admin sign-in locks an address out for 15 minutes after 10 wrong passwords, so
anyone could keep the real admin out just by guessing badly every quarter of an
hour. The limits on starting tests, on AI marking and on friend requests would
be shared by every student the same way. The API prints a warning at startup
when this is missing in production.

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

**Headers** (once the site exists: its **Settings → Headers**). Render takes
these from the dashboard only, so nothing in the repo sets them. Add one rule:

| Path | Header | Value |
| --- | --- | --- |
| `/assets/*` | `Cache-Control` | `public, max-age=31536000, immutable` |

Why: every file Vite writes to `assets/` has a fingerprint of its contents in
its name (`index-0vOOxswI.js`), so a file of that name never changes, and a
new build gives changed files new names, which the new `index.html` points
at. Without the rule Render sends `max-age=0` with them, so every visit asks
the server again about every script, stylesheet and font before the page can
start. With it, a returning visitor's browser uses its own copy straight away
for up to a year. Only `/assets/*`: `index.html`, `og-image.png` and the other
files at the top keep their names when they change, so they must not be cached
like this.

**Redirects/Rewrites** (the site's **Redirects/Rewrites** page, also in the
dashboard only). Add one rule:

| Source | Destination | Action |
| --- | --- | --- |
| `/*` | `/index.html` | Rewrite |

Every route lives after the `#` (`/#/admin`, `/#/profile`), but people type
and share addresses without it, and Render answers those (`/admin`, `/login`)
with a bare "Not Found" page. With the rule it serves the app's `index.html`
instead, and a script at the top of that page turns the address into the route
it means: `/admin` becomes `/#/admin`, `/login?next=%2Fprofile` becomes
`/#/login?next=%2Fprofile`. It has to be Rewrite, not Redirect: a redirect
would send the browser to `/index.html` and the route would be lost on the
way. Files that exist should still be served as themselves; check afterwards
that `/admin` opens the admin page and that `/robots.txt` still shows the
robots file. (`404.html` does the same job on a host that serves it for a
missing page; Render's documentation does not say whether it does, so the
rule is what to rely on.)

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
- [ ] `curl -I https://exampeak-api.onrender.com/health` shows
      `strict-transport-security` and `x-content-type-options: nosniff`, and
      no `x-powered-by`.

## The site's address

Link previews and search engines need the site's address written out in
full, so `https://exampeak.onrender.com` is in the site's own files. If the
site moves (to `exampeak.app`, say), change every one of these together:

- `apps/web/index.html`: the `canonical` link and the `og:url`, `og:image` and
  `twitter:image` tags
- `apps/web/public/robots.txt`: the `Sitemap:` line
- `apps/web/public/sitemap.xml`: the one `<loc>`
- on Render, the API's `WEB_ORIGIN` (step 3)
- in Supabase, the **Site URL** and **Redirect URLs** (step 4)

`git grep -n "exampeak.onrender.com" -- apps` should then find nothing. The
files are built into the site, so push them and let the static site redeploy.

## Things to know

- **The free plan sleeps.** A free Web Service stops after 15 minutes with no
  traffic, and the next visitor waits about a minute while it wakes up. The
  static site never sleeps, so the page appears but the subjects take a while.
  Fine for a capstone demo; open the site a minute before showing it. The
  Starter plan (about $7 a month) stays awake.
- **Custom domain**: when one is bought, add it under each service's
  **Settings → Custom Domains**, then change the address everywhere listed
  under "The site's address" above, and, if the API gets its own domain,
  `VITE_API_BASE_URL` followed by a static site redeploy.
- **Logs** are under each service's **Logs** tab. A CORS failure shows up in
  the browser console as a blocked request and in the API log as
  `Origin ... is not allowed by CORS`: check `WEB_ORIGIN` first.
- **Secrets** live only in Render's Environment tab. Nothing is added to the
  repo, and `.env` stays gitignored.
