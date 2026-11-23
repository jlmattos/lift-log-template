-- Migration 0013: widen routine_days.day_number for cycle-mode routines
--
-- The original (pre-drizzle) schema created routine_days with
-- routine_days_day_number_check limiting day_number to 1–7 (weekly model).
-- Cycle routines support 2–21 days (see setCycleDays in src/actions/routines.ts),
-- so adding a session to day 8+ currently fails with a 23514 check violation.
-- Replace the constraint with the app's actual upper bound.

ALTER TABLE routine_days
  DROP CONSTRAINT IF EXISTS routine_days_day_number_check;

ALTER TABLE routine_days
  ADD CONSTRAINT routine_days_day_number_check
  CHECK (day_number >= 1 AND day_number <= 21);
