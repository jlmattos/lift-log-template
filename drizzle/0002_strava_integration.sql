-- Strava integration: store OAuth tokens + synced cardio activities.
-- Single-user app, so strava_tokens is effectively a singleton (one row).

CREATE TABLE IF NOT EXISTS strava_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      bigint NOT NULL,
  athlete_name    text,
  access_token    text NOT NULL,
  refresh_token   text NOT NULL,
  expires_at      timestamptz NOT NULL,
  scope           text,
  connected_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cardio_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source              text NOT NULL DEFAULT 'strava', -- 'strava' | 'manual'
  strava_activity_id  bigint UNIQUE,                  -- null when source='manual'
  performed_on        date NOT NULL,
  started_at          timestamptz,
  type                text NOT NULL,                  -- 'ride' | 'run' | 'row' | 'hike' | 'walk' | 'other'
  name                text,
  duration_min        numeric NOT NULL,
  distance_m          numeric,
  avg_hr              numeric,
  max_hr              numeric,
  avg_watts           numeric,
  suffer_score        numeric,                        -- Strava's Relative Effort (0-300ish)
  estimated_load      numeric,                        -- our normalized training-stress unit
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cardio_sessions_performed_on
  ON cardio_sessions(performed_on DESC);
