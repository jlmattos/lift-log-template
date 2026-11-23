-- Migration 0014: atomic move/swap for routine-day drag-and-drop
--
-- moveRoutineDay previously swapped day contents with two separate UPDATEs;
-- a failure between them could leave both rows with the same content (the
-- dragged day's assignment + notes lost). These functions do each operation
-- in a single statement, so it either fully happens or doesn't.
--
-- Content columns are listed explicitly — if routine_days ever gains a new
-- content column, add it here AND to DAY_CONTENT_COLUMNS in
-- src/actions/routines.ts.
--
-- The app calls these with the service key; anon calls are inert because
-- RLS on routine_days grants anon no UPDATE.

-- Swap all content between two day rows (drop onto an occupied day).
create or replace function swap_routine_day_content(a uuid, b uuid)
returns void language sql as $$
  update routine_days rd
  set template_id          = o.template_id,
      cardio_template_id   = o.cardio_template_id,
      planned_cardio_type  = o.planned_cardio_type,
      planned_cardio_notes = o.planned_cardio_notes,
      notes                = o.notes
  from routine_days o
  where rd.id in (a, b) and o.id in (a, b) and rd.id <> o.id;
$$;

-- Move content src → dst and clear src (drop onto a day whose row exists but
-- shows as empty; dst's leftover values — e.g. legacy planned_cardio_* — are
-- overwritten). CASE without ELSE yields NULL for the src row.
create or replace function move_routine_day_content(src uuid, dst uuid)
returns void language sql as $$
  update routine_days rd
  set template_id          = case when rd.id = dst then s.template_id end,
      cardio_template_id   = case when rd.id = dst then s.cardio_template_id end,
      planned_cardio_type  = case when rd.id = dst then s.planned_cardio_type end,
      planned_cardio_notes = case when rd.id = dst then s.planned_cardio_notes end,
      notes                = case when rd.id = dst then s.notes end
  from (select * from routine_days where id = src) s
  where rd.id in (src, dst);
$$;
