-- Migration 0016: intervals.icu sync (Strava API replacement)
--
-- Strava's API requires a paid subscription from Aug 2026; cardio now syncs
-- Garmin → intervals.icu → lift-log via intervals.icu's free personal API.
-- Synced rows use source='intervals' and dedupe on the intervals activity id
-- (TEXT — their ids look like "i78584839"). Postgres UNIQUE allows many NULLs,
-- so existing strava/manual rows are unaffected.

ALTER TABLE cardio_sessions
  ADD COLUMN IF NOT EXISTS intervals_activity_id text;

ALTER TABLE cardio_sessions
  DROP CONSTRAINT IF EXISTS cardio_sessions_intervals_activity_id_key;
ALTER TABLE cardio_sessions
  ADD CONSTRAINT cardio_sessions_intervals_activity_id_key
  UNIQUE (intervals_activity_id);
