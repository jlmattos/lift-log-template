-- Exercise groupings (supersets / tri-sets / giant sets) and per-exercise timers.
--
-- block: adjacent template_exercises (by position) that share the same block
--   number form one group. Label (A, B, C…) and kind (superset = 2 lifts,
--   tri-set = 3, giant set = 4+) are derived in code from contiguity + size,
--   so nothing here needs renumbering when groups are added or removed.
-- rest_seconds: rest after a set of this exercise. For a grouped exercise the
--   LAST member's value is the rest between rounds; movement between members
--   is treated as "go straight".
-- timed_seconds: for time-based sets (holds, carries, rower finishers) —
--   drives the set countdown timer on the Today page.
--
-- All nullable: existing templates behave exactly as before. The app reads
-- these columns via select-* so it keeps working before this runs; only the
-- new editor controls (link / rest / timed) error until it has been applied.
-- Safe to re-run. Apply in the Supabase SQL editor.

ALTER TABLE template_exercises
  ADD COLUMN IF NOT EXISTS block smallint,
  ADD COLUMN IF NOT EXISTS rest_seconds integer,
  ADD COLUMN IF NOT EXISTS timed_seconds integer;

ALTER TABLE template_exercises
  DROP CONSTRAINT IF EXISTS template_exercises_rest_seconds_check,
  ADD CONSTRAINT template_exercises_rest_seconds_check
    CHECK (rest_seconds IS NULL OR (rest_seconds >= 0 AND rest_seconds <= 3600));

ALTER TABLE template_exercises
  DROP CONSTRAINT IF EXISTS template_exercises_timed_seconds_check,
  ADD CONSTRAINT template_exercises_timed_seconds_check
    CHECK (timed_seconds IS NULL OR (timed_seconds > 0 AND timed_seconds <= 7200));
