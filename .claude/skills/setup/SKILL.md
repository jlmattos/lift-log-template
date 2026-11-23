---
name: setup
description: Guided first-time setup of this Lift Log copy — Supabase, env vars, local run, Vercel deploy, first-run checklist. Use when the owner says "set this up", "/setup", "walk me through setup", or on the first session in a fresh clone.
---

# Guided setup

You are walking a new owner through turning this template into their own
deployed app. They may not be a developer. Go **one step at a time**: do the
step, or tell them exactly what to click, then **stop and wait** for them to
say it is done before moving on. Never dump the whole plan at once.

Rules for the whole flow:
- **Never ask them to paste a key, token or password into the chat.** Secrets
  go into `.env.local` (which they edit) or into the Vercel dashboard.
  You may create `.env.local` from `.env.example` and open it for them.
- After every step that can be checked, run `node scripts/check-setup.mjs`
  and read its output. It never prints secret values. Fix what it flags
  before moving on.
- Keep each message short: what to do, where to click, what they should see.
- If they get stuck, ask what the screen shows and adapt. Do not guess.
- `HANDOFF.md` has the long-form version of every step; read it first.

## Step 0 — Orientation (you do this)
0. **Where is the repo?** If the session was opened in a parent folder (e.g.
   Documents) rather than inside the repo, ask for the GitHub URL of the copy
   they created, `git clone` it into a subfolder here, and run every later
   command inside that folder (`cd <folder> && …`). If `git` is missing,
   install it first (macOS: `xcode-select --install`; Windows: winget
   `Git.Git`; Linux: the distro package) — tell them an admin password prompt
   may appear in the terminal, never in chat. Mention that reopening Claude
   Code inside the new folder later makes `/setup` and the project rules load
   automatically, but it is not required now.
1. Read `HANDOFF.md` and `README.md`.
2. Run `node -v`. Need 20+. If missing, install it (macOS with Homebrew:
   `brew install node`; Windows: `winget install OpenJS.NodeJS.LTS`;
   otherwise point them at https://nodejs.org LTS and wait).
3. Run `npm install`.
4. Run `node scripts/check-setup.mjs` to see the starting state.
5. Tell them in two sentences what the app is and that setup has 5 steps:
   database, local check, deploy, phone install, first-run. Ask: "Ready for
   step 1?"

## Step 1 — Supabase project (they do this, you guide)
Tell them, as a numbered list:
1. Go to https://supabase.com, sign in (GitHub login is easiest), **New project**.
2. Name it `lift-log`, choose the region nearest them, generate a database
   password (they will not need it again), Create. Wait ~2 minutes.
3. Left sidebar → **SQL Editor** → **New query**.
4. Open the file `supabase/schema.sql` in this repo, copy ALL of it, paste it
   into the editor, click **Run**. They should see "Success. No rows returned."
   (You can print the file path; if they prefer, run `cat supabase/schema.sql`
   so they can copy it from the terminal, or copy it to the clipboard with
   `pbcopy < supabase/schema.sql` on macOS / `clip < supabase\schema.sql` on
   Windows / `xclip -selection clipboard < supabase/schema.sql` on Linux.)
5. Left sidebar → **Project Settings → API**. Keep this tab open.

Then prepare the env file for them:
- `cp .env.example .env.local` (if it does not exist).
- Detect their timezone with
  `node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"`
  and set `HOME_TZ=` to it in `.env.local` yourself.
- Tell them to open `.env.local` in their editor (offer `code .env.local`,
  `open -e .env.local` on macOS, or `notepad .env.local` on Windows) and paste:
  - **Project URL** → after `NEXT_PUBLIC_SUPABASE_URL=`
  - **API Keys → secret key** (starts with `sb_secret_`) → after `SUPABASE_SECRET_KEY=`
  Save the file. Remind them this key is a password and stays out of chat.
- When they say done, run `node scripts/check-setup.mjs`. Iterate until the
  Database section says all 23 tables present.

## Step 2 — Run it locally (you do this)
1. `npm run dev` in the background; tell them to open http://localhost:3000.
2. They should see the **Today** screen with "no workout" and a bottom nav.
   If they see an error, read the terminal output and fix the env value it
   points at. Ask them to tell you what the page shows.
3. Stop the dev server when they confirm.

## Step 3 — Deploy to Vercel (they do this, you guide)
Dashboard route (simplest):
1. https://vercel.com → sign up/in with GitHub → **Add New → Project**.
2. Import this repository. Framework: Next.js (auto). Do not change build
   settings.
3. Open **Environment Variables** before deploying and add exactly three:
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `HOME_TZ` — same values
   as `.env.local`. (Print the HOME_TZ value for them; never the key.)
4. **Deploy**. ~2 minutes. Then **Visit** → the production URL. Ask them to
   paste the URL (it is not a secret, but tell them to treat it as private
   since the app has no login).
5. Set `APP_URL` to that URL in Vercel env vars later if they enable the
   optional endpoints; not needed now.

Alternative if they prefer the terminal: `npx vercel` (link project), then
`npx vercel env add NAME production` for each of the three (it prompts for
the value in the terminal, not in chat), then `npx vercel --prod`.

## Step 4 — Put it on the phone
- iPhone: open the URL in **Safari** (not Chrome) → Share → **Add to Home
  Screen**. Android: Chrome → ⋮ → **Install app** / Add to Home screen.
- It opens full-screen. Tell them that from now on this icon is the app.

## Step 5 — First-run checklist (they do this in the app, you narrate)
Walk through, one at a time, waiting for "done" after each:
1. **More → Exercises** → add 5–10 lifts they actually do. Tick *unilateral*
   for single-arm/leg lifts. Use the **Equipment** manager on that page to add
   bars (name + weight) and assign them to barbell lifts.
2. **Templates** → create one workout, add exercises, set target sets × reps.
   Show them the "link as superset" pill between two lifts and the rest
   seconds field.
3. **More → About Me** → sex, goals, injuries if any.
4. **More → Strength Standards** → log bodyweight.
5. **Today → ⏱ Timers** → tap a sound to preview (this also unlocks audio on
   iPhone). Keep-screen-awake is on by default.
6. **Today → Start from template → tap a lift → Log Set.** They have logged
   their first set. Point out the rest timer bar.

## Step 6 — Wrap up
- Offer the optional extras from `HANDOFF.md §5` as a short menu: AI advisor
  (needs an Anthropic key), cardio sync (intervals.icu or Strava), nightly
  backups (two GitHub secrets). Set up only what they pick, same rules:
  secrets go in dashboards, not chat.
- Remind them: `main` auto-deploys, and the app's `CLAUDE.md` holds the rules
  for future sessions. Suggest they commit any changes you made (`.env.local`
  is git-ignored and must stay that way).
