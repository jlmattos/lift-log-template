-- Adds related_body_parts to injury_areas so we can filter the symptom
-- correlation chart to the volume that's actually relevant to each injury.
-- Default = empty array; the UI prompts the user to fill these in.

ALTER TABLE injury_areas
  ADD COLUMN IF NOT EXISTS related_body_parts text[] NOT NULL DEFAULT '{}';

-- Sensible defaults for the two existing areas. Safe to re-run — UPDATEs
-- are idempotent and only touch rows still on the default empty array.
UPDATE injury_areas
SET related_body_parts = ARRAY['chest', 'shoulders', 'triceps', 'back', 'biceps']
WHERE LOWER(name) LIKE '%shoulder%' AND related_body_parts = '{}';

UPDATE injury_areas
SET related_body_parts = ARRAY['back', 'quads', 'hamstrings', 'glutes', 'core']
WHERE LOWER(name) LIKE '%back%' AND related_body_parts = '{}';
