-- Convert the remaining modality-locked cardio templates to the two-axis model
-- and retire the now-redundant per-modality VO2 templates.
--
-- Idempotent where practical. Run AFTER 0009 (which created the VO2 Max template).
-- Apply in the Supabase SQL editor.
--
-- Decisions (from the user):
--  1. Retire old VO2: repoint vo2_bike's routine_days → VO2 Max, then delete
--     both vo2_bike and vo2_rower.
--  2. Convert "Zone 2 Ruck" → "Zone 2" (multi-modality, ruck is one option).
--  3. Convert "Rower Sprints 8×30s" → "Sprints" (multi-modality). Its routine_days
--     already point to this row, so updating in place keeps those links intact.

-- ── 1. Retire old VO2 templates ───────────────────────────────────────────────
-- Repoint any routine_days pointing at a vo2_bike/vo2_rower template to VO2 Max.
UPDATE routine_days
SET cardio_template_id = (SELECT id FROM cardio_templates WHERE name = 'VO2 Max' LIMIT 1)
WHERE cardio_template_id IN (
  SELECT id FROM cardio_templates WHERE type IN ('vo2_bike', 'vo2_rower')
);

-- Detach any logged sessions from the soon-deleted templates (FK is ON DELETE
-- SET NULL, but do it explicitly so intent is clear and the delete is clean).
UPDATE cardio_sessions
SET cardio_template_id = NULL
WHERE cardio_template_id IN (
  SELECT id FROM cardio_templates WHERE type IN ('vo2_bike', 'vo2_rower')
);

DELETE FROM cardio_templates WHERE type IN ('vo2_bike', 'vo2_rower');

-- ── 2. Convert "Zone 2 Ruck" → multi-modality "Zone 2" ───────────────────────
UPDATE cardio_templates
SET
  name = 'Zone 2',
  type = 'zone_2',
  protocol = 'zone_2',
  allowed_modalities = '["ruck","bike","rower","run","walk","other"]'::jsonb,
  prescription_notes = E'Steady aerobic, HR 130–145 (Zone 2). 45–60 min conversational pace. Pick today''s modality when logging. For ruck: 25–45 lb pack, high on traps; drop pack if back signals.',
  -- Protocol-common metrics; modality-specific output (pack weight / watts /
  -- split / distance) is added by the app from the picked modality.
  tracked_metrics = '[
    {"key":"avg_hr","label":"Avg HR","type":"number","unit":"bpm"},
    {"key":"rpe","label":"RPE","type":"number","range":[1,10]},
    {"key":"notes","label":"Notes","type":"text"}
  ]'::jsonb,
  -- Strava match now derives from the chosen modality, not a fixed template type.
  strava_match_type = NULL
WHERE name = 'Zone 2 Ruck';

-- ── 3. Convert "Rower Sprints 8×30s" → multi-modality "Sprints" ───────────────
UPDATE cardio_templates
SET
  name = 'Sprints',
  type = 'sprints',
  protocol = 'sprints',
  allowed_modalities = '["rower","bike","run","other"]'::jsonb,
  prescription_notes = E'Short max-effort intervals. e.g. 8 × (30s @ RPE 9 / 30s easy), 3 min WU + 2 min CD. Pick today''s modality when logging.',
  tracked_metrics = '[
    {"key":"intervals_completed","label":"Intervals completed","type":"number","range":[0,12],"default":8},
    {"key":"rpe","label":"RPE on final sprint","type":"number","range":[1,10]},
    {"key":"notes","label":"Notes","type":"text"}
  ]'::jsonb,
  strava_match_type = NULL
WHERE name = 'Rower Sprints 8×30s';
