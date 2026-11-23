-- Cardio templates: define prescriptions and which metrics to track per session.
-- Hybrid model: Strava auto-captures session-level data (HR, distance, duration,
-- watts) when it's available; manual_metrics on cardio_sessions hold the gaps.

CREATE TABLE IF NOT EXISTS cardio_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL UNIQUE,
  type               text NOT NULL,           -- 'ruck' | 'vo2_bike' | 'vo2_rower' | 'rower_sprints' | 'shred_shed' | 'zone_2'
  prescription_notes text,                    -- protocol description for display
  tracked_metrics    jsonb NOT NULL DEFAULT '[]'::jsonb,
                                              -- [{ key, label, type: 'number'|'boolean'|'text'|'enum', unit, range, default, options, required }]
  strava_match_type  text,                    -- Strava activity type to match on (Ride, Rowing, Hike, Run, Walk) — null = no auto-match
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cardio_sessions
  ADD COLUMN IF NOT EXISTS cardio_template_id uuid REFERENCES cardio_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_metrics jsonb;

ALTER TABLE routine_days
  ADD COLUMN IF NOT EXISTS cardio_template_id uuid REFERENCES cardio_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cardio_sessions_template
  ON cardio_sessions(cardio_template_id);
