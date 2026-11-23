-- Two-axis cardio model: separate "protocol" (what — VO2, Zone 2, sprints) from
-- "modality" (how — bike, rower, run, ruck, walk, other).
--
-- Before: cardio templates were modality-locked (vo2_bike, vo2_rower as separate
-- rows). Now a protocol template lists allowed modalities and the modality is
-- picked per session at log time.
--
-- Safe to re-run (IF NOT EXISTS / idempotent inserts). Apply in Supabase SQL editor.

-- 1. Sessions gain protocol + modality columns (nullable — old rows just have null).
ALTER TABLE cardio_sessions
  ADD COLUMN IF NOT EXISTS protocol text,
  ADD COLUMN IF NOT EXISTS modality text;

-- 2. Templates gain protocol + the list of modalities they allow.
ALTER TABLE cardio_templates
  ADD COLUMN IF NOT EXISTS protocol text,
  ADD COLUMN IF NOT EXISTS allowed_modalities jsonb;

-- 3. Seed the first two-axis template: VO2 Max (protocol), any modality.
--    Its tracked_metrics are the protocol-common ones; the modality-specific
--    output metric (watts/pace/split/…) is added by the app at log time.
INSERT INTO cardio_templates (name, type, protocol, allowed_modalities, prescription_notes, tracked_metrics, strava_match_type)
SELECT
  'VO2 Max',
  'vo2',
  'vo2',
  '["bike","rower","run","ruck","walk","other"]'::jsonb,
  E'Norwegian 4×4 style. 5 min warm-up → 4 rounds of (4 min @ RPE 9, target 90–95% HRmax / 3 min easy) → 5 min cool-down. Pick today''s modality when logging.',
  '[
    {"key":"intervals_completed","label":"Intervals completed","type":"number","range":[0,4],"default":4},
    {"key":"avg_hr","label":"Avg HR","type":"number","unit":"bpm"},
    {"key":"max_hr","label":"Max HR","type":"number","unit":"bpm"},
    {"key":"peak_hr","label":"Peak HR","type":"number","unit":"bpm"},
    {"key":"rpe","label":"RPE on final interval","type":"number","range":[1,10]},
    {"key":"notes","label":"Notes","type":"text"}
  ]'::jsonb,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM cardio_templates WHERE name = 'VO2 Max');

-- Index for filtering/grouping by protocol later.
CREATE INDEX IF NOT EXISTS idx_cardio_sessions_protocol
  ON cardio_sessions (protocol);
