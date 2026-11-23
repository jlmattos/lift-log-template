@AGENTS.md

# Lift Log — working rules

Single-user training PWA: Next.js App Router + server actions, Supabase
Postgres (server-only secret key), Tailwind, deployed on Vercel from `main`.
Setup and conventions are in `HANDOFF.md`; keep the two in sync.

## Non-negotiables
- Read the relevant guide in `node_modules/next/dist/docs/` before writing
  Next.js code. This version differs from training data.
- Database access only in `src/actions/*` (server). Never in client components.
- "What day is it" always goes through `todayLocal()` (`src/lib/dates.ts`).
- Queries over `sets` that may exceed 1000 rows use `fetchAllRows()`.
- Schema changes are numbered SQL files in `drizzle/`, applied by hand in the
  Supabase SQL editor. Never `drizzle-kit push`. Make code tolerate a lagging
  migration where practical (see the PGRST200 fallbacks in `actions/workouts.ts`).
- Before pushing to `main`: `npm run lint` and `npx tsc --noEmit` clean, and
  confirm no workout is open today (`workouts.completed_at is null`).

## Style
- Optimistic UI for anything the user does mid-set; roll back with a message.
- Mobile-first, one-hand use, dark theme. Big tap targets in the logger.
- Prefer extending an existing component over adding a parallel one.
