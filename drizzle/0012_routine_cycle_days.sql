-- Cycle-mode routines: an N-day loop untethered from weekdays.
--
-- cycle_days NULL  → legacy weekly routine (weeks × Mon–Sun calendar grid;
--                    Today shows the weekday's slot).
-- cycle_days = N   → the routine is one ordered cycle of N day-slots
--                    (day_number 1..N, week_number fixed at 1). "Up next"
--                    advances by COMPLETION (workout / cardio / skip), never
--                    by calendar date — resting simply pauses the sequence.
--
-- Safe to re-run. Apply in the Supabase SQL editor.

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS cycle_days integer;
