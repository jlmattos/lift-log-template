-- Per-exercise strength goals. The user sets a target e1RM (and optional
-- target date) for a specific exercise; /eta projects toward this personal
-- target alongside the next generic StrengthLevel tier.
--
-- One goal per exercise (unique index). Safe to re-run.

CREATE TABLE IF NOT EXISTS lift_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  target_e1rm numeric NOT NULL,
  target_date date,
  note text,
  achieved_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lift_goals_one_per_exercise
  ON lift_goals (exercise_id);
