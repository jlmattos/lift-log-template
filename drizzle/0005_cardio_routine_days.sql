-- Let routine_days hold either a strength template OR a planned cardio session.
-- planned_cardio_type: short label like 'ruck', 'vo2', 'zone_2', 'rest', 'shred_shed'
-- planned_cardio_notes: free text for the prescription ('30-35 lb pack × 50-60 min Zone 2')

ALTER TABLE routine_days
  ADD COLUMN IF NOT EXISTS planned_cardio_type text,
  ADD COLUMN IF NOT EXISTS planned_cardio_notes text;
