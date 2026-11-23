-- Equipment: named plate-loaded implements (trap bar, EZ bar, SSB, ...) with
-- their own empty-bar weight. An exercise can reference one; plate math then
-- uses that bar's weight instead of the default 45 lb barbell. Deleting a bar
-- unlinks its exercises (SET NULL) rather than blocking or cascading.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  bar_weight numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Server uses the service key (bypasses RLS); anon gets nothing.
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES equipment(id) ON DELETE SET NULL;

INSERT INTO equipment (name, bar_weight)
  VALUES ('Trap bar', 50)
  ON CONFLICT (name) DO NOTHING;
