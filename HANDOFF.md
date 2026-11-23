# Lift Log — Handoff for a new owner

This repository is a blank copy of a working personal training app. It has
the full code and schema, and none of the previous owner's data. This document
takes you from "Use this template" to a deployed app on your phone. It is
written so you can paste it to Claude Code and say "set this up with me".

Budget: about 30 minutes, all on free tiers.

---

## 0. What you are setting up

- **GitHub** — this repo (you already have it).
- **Supabase** — a free Postgres project. The database.
- **Vercel** — free hosting. Every push to `main` deploys.
- Optional later: an Anthropic API key (AI advisor), intervals.icu or Strava
  (cardio sync).

The app has no login. Protection is: nobody knows your Vercel URL, search
engines are told not to index it, and the database is only reachable from
server code with a secret key. That is fine for training data. If you ever
want more, add Vercel's password protection or a middleware check.

---

## 1. Create the database (Supabase)

1. Go to https://supabase.com → **New project**. Any name, pick the region
   closest to you, set a strong database password (you will not need it again).
2. Wait for the project to finish provisioning (~2 min).
3. Left sidebar → **SQL Editor** → **New query**.
4. Open `supabase/schema.sql` from this repo, paste the **entire file**, click
   **Run**. Expected: "Success. No rows returned."
5. Left sidebar → **Project Settings → API**. Copy two values:
   - **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **API Keys → secret key** (starts with `sb_secret_`) → this is
     `SUPABASE_SECRET_KEY`. Treat it like a password.

> The schema turns Row Level Security on for every table with no policies.
> That is deliberate: the publishable/anon key can read nothing, and the app
> only ever uses the secret key from the server.

---

## 2. Run it locally (optional but recommended)

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`: paste the two Supabase values and set `HOME_TZ` to your
IANA timezone (e.g. `America/Chicago`, `Europe/London`). Then:

```bash
npm run dev
```

Open http://localhost:3000. You should see the Today screen with no workout.
If you see a Supabase error instead, one of the two values is wrong.

---

## 3. Deploy (Vercel)

1. https://vercel.com → **Add New → Project** → import this GitHub repo.
   Framework preset: Next.js (auto-detected). Do not change build settings.
2. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | from step 1 |
   | `SUPABASE_SECRET_KEY` | from step 1 |
   | `HOME_TZ` | your timezone, e.g. `America/Chicago` |

3. Click **Deploy**. First build takes ~2 minutes.
4. Open the production URL on your phone. In Safari (iPhone) tap Share → **Add
   to Home Screen**; on Android Chrome use the install prompt. It runs
   full-screen as a PWA.

Every later `git push` to `main` redeploys automatically. New environment
variables only take effect after a redeploy (Deployments → ⋯ → Redeploy).

---

## 4. First-run checklist (in the app)

The database is empty. Set up in this order; each step takes a minute.

1. **More → Exercises** — add exercises. Tick *unilateral* for single-arm or
   single-leg lifts (the logger then records left and right separately).
2. **Equipment** (the manager on the same Exercises page) — add your bars
   (name + bar weight) and assign them to barbell lifts. Enables plate math.
3. **Templates** — create a workout template, add exercises, set target sets
   and reps. Link adjacent exercises into a superset with the "link as
   superset" pill. Set rest seconds on each lift (or on the last lift of a
   block for round rest). Set a timed-set duration for holds or rower work.
4. **Routines** — optional. A routine is a multi-week calendar of templates
   and cardio days. Make one active and the Today screen suggests what is next.
5. **More → About Me** — sex (for strength standards), goals, training style,
   any injuries. The AI advisor reads this.
6. **More → Strength Standards** — log bodyweight and pick which of your
   exercises count as squat / bench / deadlift / press.
7. **Today** — tap ⏱ Timers once to pick an alarm sound. That first tap also
   unlocks audio on the phone.

Then just train: Today → start from template → tap an exercise → Log Set.

---

## 5. Optional integrations

Everything below degrades gracefully when its variable is missing: the
feature shows a "not configured" state and nothing else breaks.

### AI advisor (Chat page + digest insights)
- Get a key at https://console.anthropic.com.
- Add `ANTHROPIC_API_KEY` in Vercel env vars → Redeploy.
- The model id is set in `src/app/api/chat/route.ts`; update it when newer
  models ship.

### Read-only data endpoints (for external tools / other Claude projects)
- `HEALTH_API_TOKEN` protects `GET /api/health?token=…` — a full JSON export
  of workouts, sets, cardio, bodyweight, symptoms, goals (never OAuth tokens
  or chat history).
- `MCP_SECRET` protects `/api/mcp/<MCP_SECRET>`, an MCP server exposing
  ~30 read-only tools over your data. Point Claude Desktop or Claude.ai at it
  as a custom connector.
- Generate each with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- Set `APP_URL` to your production URL so generated links are absolute.
- Rotate by changing the value and redeploying; the old URL dies instantly.

### Cardio sync
- **intervals.icu (recommended, free):** connect your watch/Garmin to
  intervals.icu, then Settings → Developer Settings → create an API key →
  `INTERVALS_API_KEY`. The Cardio page's Sync button pulls activities and
  training load.
- **Strava:** needs a Strava API application and, since 2026, a paid Strava
  subscription for API access. `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`,
  then connect under More → Strava Connection. Note: Strava changes its API base
  URL on 2027-06-01; see the comment in `src/lib/strava.ts`.
- Without either, log cardio manually from the Cardio page.

### Nightly backups (recommended)
`.github/workflows/backup.yml` dumps the whole database to
`backups/latest.json` every night and commits it, so git history becomes your
backup archive. To enable: repo **Settings → Secrets and variables → Actions**
→ add `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Without the secrets the
action fails harmlessly each night; delete the workflow file if you do not
want it.

---

## 6. How to change the schema later

Migrations are plain SQL files in `drizzle/`, numbered. `schema.sql` already
includes everything up to `0019`. For a new change:

1. Write `drizzle/0020_what_it_does.sql`, idempotent
   (`add column if not exists …`).
2. Paste it into the Supabase SQL editor and run it.
3. Ship the code that uses it. Where practical, make code tolerate the column
   being absent so a deploy that lands before the SQL does not break logging.

Do **not** run `drizzle-kit push`: `src/db/schema.ts` models only a few
tables and push would try to drop the rest.

---

## 7. Conventions your Claude Code should keep

Paste this section into your `CLAUDE.md` if you edit it; it is already there.

- **Read `node_modules/next/dist/docs/` before writing Next.js code.** This
  Next version differs from what models were trained on (see `AGENTS.md`).
- **All database access is in `src/actions/*` server actions** using the
  secret key. Never import the Supabase client into a client component.
- **Day identity goes through `todayLocal()`** in `src/lib/dates.ts`, never
  `new Date().toISOString().slice(0,10)` — the server runs in UTC.
- **Any query over `sets` that can exceed 1000 rows uses `fetchAllRows()`**
  — Supabase caps a single select at 1000 and silently truncates.
- **Optimistic UI for logging**: paint the set, then sync; roll back on error.
  See `set-logger.tsx` and the `pendingSets` logic in `today-view.tsx`.
- **Never deploy while a workout is open** (`workouts.completed_at is null`
  for today): a deploy mid-session breaks the open logging page.
- `main` auto-deploys. Lint and `tsc --noEmit` must be clean first.

---

## 8. Things you may want to change first

- `public/manifest.json` and `src/app/layout.tsx` — app name and icons.
- `src/lib/dates.ts` — the fallback timezone if `HOME_TZ` is unset.
- `src/lib/strength-standards.ts` — standards tables assume lbs.
- Units are pounds throughout. A kg switch is a real project, not a flag.
