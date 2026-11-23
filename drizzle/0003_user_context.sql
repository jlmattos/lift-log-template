-- User context for the AI fitness advisor. Singleton table plus injury enrichment.

ALTER TABLE injury_areas
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  -- status: 'active' | 'rehabbing' | 'managing' | 'resolved'
  ADD COLUMN IF NOT EXISTS training_modifications text,
  ADD COLUMN IF NOT EXISTS started_on date;

CREATE TABLE IF NOT EXISTS user_context (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goals         text,
  training_style text,
  notes         text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Sensible default row so the editor has something to edit
INSERT INTO user_context (goals, training_style, notes)
SELECT
  'Add your current goals here. Examples: hit Advanced tier on RDL by Q3, fix L shoulder asymmetry, build cardio base.',
  'Add your training philosophy here. Examples: 5x/wk upper-lower split, generally RPE 7-8, drop to RPE 4-5 on rehab exercises.',
  'Anything else Claude should know about you — preferences, constraints, history.'
WHERE NOT EXISTS (SELECT 1 FROM user_context);

-- Default existing areas to 'rehabbing' so they're not assumed resolved
UPDATE injury_areas
SET status = 'rehabbing'
WHERE status = 'active';
