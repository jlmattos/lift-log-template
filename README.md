# Lift Log

A single-user strength-training PWA: plan templates and multi-week routines,
log sets fast in the gym (unilateral left/right, supersets, rest and set
timers), and get analytics on top — e1RM trends, PRs, plateaus, strength
standards, muscle-volume heatmaps, cardio load (TSB), injury check-ins, and an
optional AI advisor that can query all of it.

Built with Next.js (App Router, server actions), Supabase (Postgres) and
Tailwind. Deploys to Vercel. No login: it is meant for exactly one person and
is protected by an unguessable URL plus server-only database access.

**New here? Read [HANDOFF.md](./HANDOFF.md).** It walks you (or your Claude
Code session) from an empty clone to a deployed app in about 30 minutes.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the two required values
npm run dev                  # http://localhost:3000
```

`npm run lint` and `npx tsc --noEmit` must both be clean before a push to
`main`, because `main` auto-deploys.

## Repository map

| Path | What |
|------|------|
| `src/app/` | Routes (App Router). `page.tsx` is the Today screen. |
| `src/actions/` | Server actions — all database access lives here. |
| `src/components/` | UI. `today-view.tsx`, `set-logger.tsx`, `template-editor.tsx` are the heart of logging. |
| `src/lib/` | Pure helpers: e1RM math, dates, groups, timers, Strava/intervals clients. |
| `supabase/schema.sql` | Complete schema. Run once on a fresh Supabase project. |
| `drizzle/` | Historical migrations (already folded into `schema.sql`). New changes go here as `0020_…sql`. |
| `scripts/backup.mjs` | Nightly JSON dump used by the GitHub Action in `.github/workflows/backup.yml`. |
| `AGENTS.md`, `CLAUDE.md` | Rules for AI coding agents working in this repo. |
