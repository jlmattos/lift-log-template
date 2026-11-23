-- Indexes for the /api/health `?since=` incremental filter.
--
-- The endpoint filters each collection by `created_at > since` (and the sets
-- table is the big one, ~5k rows and growing). Without an index Postgres does a
-- sequential scan; at current size that's fine, but these keep the filter fast
-- as the data grows. `sets` is the only one that really matters today — the rest
-- are small but indexed for consistent semantics.
--
-- Safe to re-run (IF NOT EXISTS). Apply in the Supabase SQL editor.

CREATE INDEX IF NOT EXISTS idx_sets_created_at
  ON sets (created_at);

CREATE INDEX IF NOT EXISTS idx_workouts_created_at
  ON workouts (created_at);

CREATE INDEX IF NOT EXISTS idx_cardio_sessions_created_at
  ON cardio_sessions (created_at);

CREATE INDEX IF NOT EXISTS idx_symptom_checkins_created_at
  ON symptom_checkins (created_at);

CREATE INDEX IF NOT EXISTS idx_bodyweight_logs_created_at
  ON bodyweight_logs (created_at);
