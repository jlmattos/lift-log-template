-- Per-workout exercise swaps/skips. When the user swaps a planned exercise out
-- of today's session (e.g. back flared → do a different lift), we record the
-- skipped planned exercise here so it stops showing in that workout's "up next"
-- list — without touching the template. The replacement is just logged normally.
--
-- Scoped to one workout: a new day from the same template starts fresh.
-- Safe to re-run. Apply in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS workout_exercise_skips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workout_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_workout_exercise_skips_workout
  ON workout_exercise_skips (workout_id);
