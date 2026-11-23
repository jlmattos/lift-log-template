-- New cardio protocol: "Zone 2 + HIIT" — one session carrying both stimuli
-- (an aerobic base block, then a short high-intensity block as the finisher).
--
-- Two-axis model (see 0009): `protocol` is the "what", the modality is picked at
-- log time from `allowed_modalities`. HIIT-capable modalities only — ruck/walk
-- can't hold a 30s hard interval, so they're deliberately left out.
--
-- Idempotent (guarded insert). Apply in the Supabase SQL editor.

INSERT INTO cardio_templates (name, type, protocol, allowed_modalities, prescription_notes, tracked_metrics, strava_match_type)
SELECT
  'Zone 2 + HIIT',
  'z2_hiit',
  'z2_hiit',
  '["bike","rower","run","other"]'::jsonb,
  E'Two stimuli in one session — aerobic base first, intensity last, so the Zone 2 work isn''t run on legs the intervals already emptied.\n\n- **5 min** easy warm-up\n- **30–40 min Zone 2** — HR 130–145, conversational pace\n- **8 × (30s @ RPE 9 / 90s easy)** HIIT block\n- **5 min** cool-down\n\nPick today''s modality when logging. Cut the HIIT block to 6 intervals if the Zone 2 block ran long or HR never settled into range.',
  '[
    {"key":"z2_duration_min","label":"Zone 2 block","type":"number","unit":"min","default":35},
    {"key":"z2_avg_hr","label":"Avg HR — Zone 2 block","type":"number","unit":"bpm"},
    {"key":"intervals_completed","label":"HIIT intervals completed","type":"number","range":[0,12],"default":8},
    {"key":"peak_hr","label":"Peak HR — HIIT block","type":"number","unit":"bpm"},
    {"key":"avg_hr","label":"Avg HR — whole session","type":"number","unit":"bpm"},
    {"key":"rpe","label":"RPE on final interval","type":"number","range":[1,10]},
    {"key":"notes","label":"Notes","type":"text"}
  ]'::jsonb,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM cardio_templates WHERE name = 'Zone 2 + HIIT');
