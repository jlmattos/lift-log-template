-- Migration 0015: cardio-day skips
--
-- routine_skips could only record strength skips (template_id NOT NULL), so
-- the Up Next "Skip" button was strength-only. Add a cardio counterpart and
-- relax the NOT NULL so a skip row carries exactly one of the two.

ALTER TABLE routine_skips
  ADD COLUMN IF NOT EXISTS cardio_template_id uuid REFERENCES cardio_templates(id) ON DELETE CASCADE;

ALTER TABLE routine_skips
  ALTER COLUMN template_id DROP NOT NULL;

-- Exactly one of the two must be set.
ALTER TABLE routine_skips
  DROP CONSTRAINT IF EXISTS routine_skips_target_check;
ALTER TABLE routine_skips
  ADD CONSTRAINT routine_skips_target_check
  CHECK ((template_id IS NOT NULL) <> (cardio_template_id IS NOT NULL));
