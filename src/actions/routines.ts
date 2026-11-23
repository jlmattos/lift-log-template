"use server";

import { supabase } from "@/db";
import { todayLocal } from "@/lib/dates";
import { nextSequenceIndex } from "@/lib/cycle-position";
import { revalidatePath } from "next/cache";

export async function createRoutine(name: string, weeks: number, cycleDays?: number) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Routine name is required");
  if (weeks < 1 || weeks > 12) throw new Error("Weeks must be 1-12");
  if (cycleDays != null && (cycleDays < 2 || cycleDays > 21)) {
    throw new Error("Cycle length must be 2-21 days");
  }

  // Cycle routines are a single ordered loop of N day-slots (weeks forced to 1);
  // weekly routines keep the weeks × 7 calendar model (cycle_days null).
  const row: Record<string, unknown> = { name: trimmed, weeks: cycleDays != null ? 1 : weeks };
  if (cycleDays != null) row.cycle_days = cycleDays;

  const { data, error } = await supabase
    .from("routines")
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/routines");
  return data;
}

/**
 * Convert a routine to cycle mode, or change an existing cycle's length.
 * Cycle mode = one ordered loop of N day-slots, untethered from weekdays;
 * "up next" advances by completion, never by calendar date.
 *
 * Guards: only 1-week routines can convert (multi-week calendars don't map);
 * shrinking is blocked while slots beyond the new length still hold sessions.
 */
export async function setCycleDays(routineId: string, cycleDays: number) {
  if (cycleDays < 2 || cycleDays > 21) throw new Error("Cycle length must be 2-21 days");

  const { data: routine } = await supabase
    .from("routines")
    .select("weeks, cycle_days")
    .eq("id", routineId)
    .single();
  if (!routine) throw new Error("Routine not found");
  if (routine.cycle_days == null && routine.weeks !== 1) {
    throw new Error("Only 1-week routines can be converted to a day cycle");
  }

  // Refuse to shrink past occupied slots — no silent data loss.
  const { data: beyond } = await supabase
    .from("routine_days")
    .select("day_number, template_id, cardio_template_id")
    .eq("routine_id", routineId)
    .gt("day_number", cycleDays);
  const occupied = (beyond ?? []).filter((d) => d.template_id || d.cardio_template_id);
  if (occupied.length > 0) {
    throw new Error(
      `Days ${occupied.map((d) => d.day_number).join(", ")} still have sessions — clear them before shortening the cycle`
    );
  }

  const { error } = await supabase
    .from("routines")
    .update({ cycle_days: cycleDays, weeks: 1 })
    .eq("id", routineId);
  if (error) throw new Error(error.message);

  revalidatePath("/routines");
  revalidatePath(`/routines/${routineId}`);
  revalidatePath("/");
}

export async function listRoutines() {
  const { data, error } = await supabase
    .from("routines")
    .select("*")
    .order("name");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getRoutine(id: string) {
  const { data: routine, error } = await supabase
    .from("routines")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !routine) return null;

  const { data: days } = await supabase
    .from("routine_days")
    .select("*, templates(id, name, category), cardio_templates(id, name, type)")
    .eq("routine_id", id)
    .order("week_number")
    .order("day_number");

  return {
    ...routine,
    days: (days ?? []).map((d) => ({
      id: d.id as string,
      weekNumber: d.week_number as number,
      dayNumber: d.day_number as number,
      templateId: d.template_id as string | null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      template: (d as any).templates ?? null,
      cardioTemplateId: (d.cardio_template_id as string | null) ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cardioTemplate: (d as any).cardio_templates ?? null,
      notes: (d.notes as string | null) ?? null,
    })),
  };
}

/**
 * UPSERT a routine_day row, preserving fields not being changed.
 * `fields` may include any combination of template_id, cardio_template_id, notes.
 */
async function upsertRoutineDay(
  routineId: string,
  weekNumber: number,
  dayNumber: number,
  fields: { template_id?: string | null; cardio_template_id?: string | null; notes?: string | null }
) {
  const { data: existing } = await supabase
    .from("routine_days")
    .select("id")
    .eq("routine_id", routineId)
    .eq("week_number", weekNumber)
    .eq("day_number", dayNumber)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("routine_days").update(fields).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    // Insert a new row with whatever fields we have (others default to null)
    const row = {
      routine_id: routineId,
      week_number: weekNumber,
      day_number: dayNumber,
      ...fields,
    };
    const { error } = await supabase.from("routine_days").insert(row);
    if (error) throw new Error(error.message);
  }
}

export async function setRoutineDay(
  routineId: string,
  weekNumber: number,
  dayNumber: number,
  templateId: string | null
) {
  await upsertRoutineDay(routineId, weekNumber, dayNumber, { template_id: templateId });
  revalidatePath(`/routines/${routineId}`);
  revalidatePath("/");
}

export async function setRoutineDayCardio(
  routineId: string,
  weekNumber: number,
  dayNumber: number,
  cardioTemplateId: string | null
) {
  await upsertRoutineDay(routineId, weekNumber, dayNumber, { cardio_template_id: cardioTemplateId });
  revalidatePath(`/routines/${routineId}`);
  revalidatePath("/");
}

export async function setRoutineDayNotes(
  routineId: string,
  weekNumber: number,
  dayNumber: number,
  notes: string | null
) {
  await upsertRoutineDay(routineId, weekNumber, dayNumber, {
    notes: notes?.trim() || null,
  });
  revalidatePath(`/routines/${routineId}`);
  revalidatePath("/");
}

export async function clearRoutineDay(
  routineId: string,
  weekNumber: number,
  dayNumber: number
) {
  // Full rest day — wipe strength + cardio assignments (keep notes if user wants)
  await upsertRoutineDay(routineId, weekNumber, dayNumber, {
    template_id: null,
    cardio_template_id: null,
  });
  revalidatePath(`/routines/${routineId}`);
  revalidatePath("/");
}

// The columns that make up a day's "contents" for move/swap. Must stay in
// sync with the column lists in drizzle/0014_routine_day_move_functions.sql.
const DAY_CONTENT_COLUMNS = [
  "template_id",
  "cardio_template_id",
  "planned_cardio_type",
  "planned_cardio_notes",
  "notes",
] as const;

// PGRST202 / 42883 = function missing (migration 0014 not applied yet).
function isMissingFunctionError(error: { code?: string; message?: string }): boolean {
  if (error.code === "42883" || error.code === "PGRST202") return true;
  return /could not find the function/i.test(error.message ?? "");
}

/**
 * Move one day's contents to another slot (drag-and-drop in the editor).
 * - No row at the target → the source row is re-pointed to the new
 *   coordinates (single statement; coordinates can't collide).
 * - Target row exists but shows as empty in the editor (no template, no
 *   cardio, no notes) → contents move onto it and the source is cleared.
 *   Leftover invisible values on the target (legacy planned_cardio_*) are
 *   overwritten rather than swapped back onto the source day.
 * - Target visibly occupied → the two days swap contents.
 * Content moves/swaps run atomically via the 0014 SQL functions; before that
 * migration is applied they fall back to two updates ordered so a partial
 * failure can only duplicate content, never lose it.
 */
export async function moveRoutineDay(
  routineId: string,
  from: { week: number; day: number },
  to: { week: number; day: number }
) {
  for (const p of [from, to]) {
    if (!Number.isInteger(p.week) || p.week < 1 || !Number.isInteger(p.day) || p.day < 1 || p.day > 21) {
      throw new Error("Invalid day coordinates");
    }
  }
  if (from.week === to.week && from.day === to.day) return;

  const loadRow = async (week: number, day: number) => {
    const { data, error } = await supabase
      .from("routine_days")
      .select("*")
      .eq("routine_id", routineId)
      .eq("week_number", week)
      .eq("day_number", day)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  };
  const fromRow = await loadRow(from.week, from.day);
  if (!fromRow) return; // nothing to move
  const toRow = await loadRow(to.week, to.day);

  if (!toRow) {
    const { error } = await supabase
      .from("routine_days")
      .update({ week_number: to.week, day_number: to.day })
      .eq("id", fromRow.id);
    if (error) throw new Error(error.message);
  } else {
    const targetOccupied = !!(toRow.template_id || toRow.cardio_template_id || toRow.notes);
    const { error } = targetOccupied
      ? await supabase.rpc("swap_routine_day_content", { a: fromRow.id, b: toRow.id })
      : await supabase.rpc("move_routine_day_content", { src: fromRow.id, dst: toRow.id });
    if (error) {
      if (!isMissingFunctionError(error)) throw new Error(error.message);
      const contentOf = (row: Record<string, unknown>) =>
        Object.fromEntries(DAY_CONTENT_COLUMNS.map((k) => [k, row[k] ?? null]));
      const cleared = Object.fromEntries(DAY_CONTENT_COLUMNS.map((k) => [k, null]));
      // Destination first: if the second update fails we're left with a
      // duplicate, not a lost day.
      const { error: e1 } = await supabase
        .from("routine_days")
        .update(contentOf(fromRow))
        .eq("id", toRow.id);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase
        .from("routine_days")
        .update(targetOccupied ? contentOf(toRow) : cleared)
        .eq("id", fromRow.id);
      if (e2) throw new Error(e2.message);
    }
  }

  revalidatePath(`/routines/${routineId}`);
  revalidatePath("/");
}

export async function activateRoutine(routineId: string) {
  // Deactivate any currently active routines
  await supabase
    .from("routines")
    .update({ is_active: false })
    .eq("is_active", true);

  const today = todayLocal();
  const { error } = await supabase
    .from("routines")
    .update({ is_active: true, started_on: today })
    .eq("id", routineId);

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/routines");
}

export async function deactivateRoutine() {
  const { error } = await supabase
    .from("routines")
    .update({ is_active: false })
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/routines");
}

/**
 * Copy all routine_days from one week into another (overwrites destination).
 */
export async function copyRoutineWeek(
  routineId: string,
  fromWeek: number,
  toWeek: number
) {
  const { data: source } = await supabase
    .from("routine_days")
    .select("day_number, template_id, cardio_template_id, planned_cardio_type, planned_cardio_notes, notes")
    .eq("routine_id", routineId)
    .eq("week_number", fromWeek);

  // Wipe destination week
  await supabase
    .from("routine_days")
    .delete()
    .eq("routine_id", routineId)
    .eq("week_number", toWeek);

  if (source && source.length > 0) {
    const { error } = await supabase.from("routine_days").insert(
      source.map((d) => ({
        routine_id: routineId,
        week_number: toWeek,
        ...d,
      }))
    );
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/routines/${routineId}`);
  revalidatePath("/routines");
  revalidatePath("/");
}

/**
 * Clone a routine (name + weeks + schedule) into a new inactive routine.
 */
export async function duplicateRoutine(id: string) {
  const { data: routine } = await supabase
    .from("routines")
    .select("*")
    .eq("id", id)
    .single();
  if (!routine) throw new Error("Routine not found");

  const { data: newRoutine, error } = await supabase
    .from("routines")
    .insert({
      name: `${routine.name} (copy)`,
      weeks: routine.weeks,
      cycle_days: routine.cycle_days ?? null,
      is_active: false,
      started_on: null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { data: days } = await supabase
    .from("routine_days")
    .select("week_number, day_number, template_id, cardio_template_id, planned_cardio_type, planned_cardio_notes, notes")
    .eq("routine_id", id);

  if (days && days.length > 0) {
    await supabase.from("routine_days").insert(
      days.map((d) => ({
        routine_id: newRoutine.id,
        ...d,
      }))
    );
  }

  revalidatePath("/routines");
  return newRoutine;
}

/**
 * Load routines with their full schedule attached, for the overview cards.
 */
export async function listRoutinesWithSchedule() {
  const { data: routines, error } = await supabase
    .from("routines")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);

  const result = await Promise.all(
    (routines ?? []).map(async (r) => {
      const { data: days } = await supabase
        .from("routine_days")
        .select("week_number, day_number, templates(name), cardio_templates(name)")
        .eq("routine_id", r.id)
        .order("week_number")
        .order("day_number");

      return {
        id: r.id as string,
        name: r.name as string,
        weeks: r.weeks as number,
        cycle_days: (r.cycle_days as number | null) ?? null,
        is_active: r.is_active as boolean,
        started_on: (r.started_on as string | null) ?? null,
        days: (days ?? []).map((d) => ({
          weekNumber: d.week_number as number,
          dayNumber: d.day_number as number,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          templateName: ((d as any).templates?.name as string) ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cardioTemplateName: ((d as any).cardio_templates?.name as string) ?? null,
        })),
      };
    })
  );

  return result;
}

export async function deleteRoutine(id: string) {
  const { error } = await supabase.from("routines").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/routines");
}

export async function updateRoutine(
  id: string,
  data: { name?: string; weeks?: number }
) {
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) throw new Error("Routine name is required");
    update.name = trimmed;
  }
  if (data.weeks !== undefined) {
    if (data.weeks < 1 || data.weeks > 12) throw new Error("Weeks must be 1-12");
    update.weeks = data.weeks;
  }

  const { error } = await supabase.from("routines").update(update).eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(`/routines/${id}`);
  revalidatePath("/routines");
}

/**
 * Skip a routine day — records that the user is explicitly skipping the given
 * strength template OR cardio template, so the "next" logic advances past it.
 * Cardio skips need migration 0015 (routine_skips.cardio_template_id).
 */
export async function skipRoutineDay(
  routineId: string,
  target: { templateId?: string | null; cardioTemplateId?: string | null }
) {
  const row: Record<string, unknown> = { routine_id: routineId, skipped_on: todayLocal() };
  if (target.templateId) row.template_id = target.templateId;
  else if (target.cardioTemplateId) row.cardio_template_id = target.cardioTemplateId;
  else throw new Error("Nothing to skip");

  const { error } = await supabase.from("routine_skips").insert(row);
  if (error) {
    if (/cardio_template_id/i.test(error.message) && /could not find|does not exist/i.test(error.message)) {
      throw new Error("Cardio-day skips need migration 0015 — run drizzle/0015_routine_skips_cardio.sql");
    }
    throw new Error(error.message);
  }
  revalidatePath("/");
}

/**
 * Figure out what the user should do next based on:
 *  - The active routine's ordered sequence of templates
 *  - The most recent workout OR explicit skip (since routine start)
 *  - "Next" = the position after the most recent completed/skipped routine workout
 *
 * Returns null if no active routine.
 */

/**
 * What's scheduled for TODAY based on calendar day-of-week, regardless of
 * sequence/progress. Returns the routine_day row including either a
 * strength template OR a planned cardio prescription.
 *
 * Day mapping: Monday = routine day 1, ..., Sunday = routine day 7.
 * Always reads from week 1 (briefing-friendly), since the same weekly
 * pattern repeats across multi-week routines.
 */
export async function getTodayPlannedSession() {
  // select("*") so this tolerates the cycle_days column not existing yet
  // (pre-migration 0012): absent column → undefined → weekly mode.
  const { data: active } = await supabase
    .from("routines")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (!active) return null;

  const jsDay = new Date().getDay(); // 0 Sun .. 6 Sat
  const routineDay = jsDay === 0 ? 7 : jsDay; // → 1..7 Mon-Sun

  // Compute current week within the routine cycle. If no start date is set
  // (legacy), default to week 1 so the briefing always shows something.
  const totalWeeks = (active.weeks as number) || 1;
  let currentWeek = 1;
  let preStart = false;
  let daysUntilStart = 0;
  if (active.started_on) {
    const startMs = new Date(active.started_on + "T00:00:00").getTime();
    const todayMs = new Date(todayLocal() + "T00:00:00").getTime();
    const dayMs = 1000 * 60 * 60 * 24;
    if (todayMs < startMs) {
      // Routine hasn't started yet — flag pre-start state so briefing can render appropriately
      preStart = true;
      daysUntilStart = Math.ceil((startMs - todayMs) / dayMs);
    }
    const daysElapsed = Math.max(0, Math.floor((todayMs - startMs) / dayMs));
    const weeksElapsed = Math.floor(daysElapsed / 7);
    currentWeek = (weeksElapsed % totalWeeks) + 1;
  }

  // If we're pre-start, don't pull today's calendar slot — surface the start state instead
  if (preStart) {
    return {
      routine: { ...active, current_week: currentWeek, preStart: true, daysUntilStart },
      day: null,
    };
  }

  // CYCLE MODE: the routine is an ordered loop of day-slots, untethered from
  // weekdays. "Today's" session = the next sequenceable slot after the most
  // recently completed one (workout, cardio session, or skip) — advancing by
  // COMPLETION, never by calendar date. Resting simply pauses the sequence.
  let day: Record<string, unknown> | null = null;
  if (active.cycle_days) {
    const { data: slots } = await supabase
      .from("routine_days")
      .select("*, templates(id, name, category)")
      .eq("routine_id", active.id)
      .order("day_number");
    const seq = (slots ?? []).filter((s) => s.template_id || s.cardio_template_id);
    if (seq.length === 0) return { routine: active, day: null };

    const templateIds = seq.map((s) => s.template_id).filter(Boolean);
    const cardioIds = seq.map((s) => s.cardio_template_id).filter(Boolean);
    const startedOn = (active.started_on as string | null) ?? "1970-01-01";

    // ALL routine-aligned events since start, chronological — the sequence
    // engine walks them to find the true position (last-event matching broke
    // when the same template filled several slots, e.g. Zone 2 3× per cycle).
    const [{ data: seqW }, { data: seqC }, { data: seqSkips }] = await Promise.all([
      templateIds.length
        ? supabase.from("workouts").select("template_id, created_at")
            .gte("performed_on", startedOn).in("template_id", templateIds)
            .order("created_at", { ascending: true }).limit(1000)
        : Promise.resolve({ data: [] }),
      cardioIds.length
        ? supabase.from("cardio_sessions").select("cardio_template_id, created_at")
            .gte("performed_on", startedOn).in("cardio_template_id", cardioIds)
            .order("created_at", { ascending: true }).limit(1000)
        : Promise.resolve({ data: [] }),
      // select("*") tolerates the cardio_template_id column not existing yet
      supabase.from("routine_skips").select("*")
        .eq("routine_id", active.id).gte("skipped_on", startedOn)
        .order("created_at", { ascending: true }).limit(1000),
    ]);

    const events: { key: string; ts: number }[] = [];
    for (const w of seqW ?? []) events.push({ key: `t:${w.template_id}`, ts: new Date(w.created_at as string).getTime() });
    for (const c of seqC ?? []) events.push({ key: `c:${c.cardio_template_id}`, ts: new Date(c.created_at as string).getTime() });
    for (const s of seqSkips ?? []) {
      const key = s.template_id ? `t:${s.template_id}` : s.cardio_template_id ? `c:${s.cardio_template_id}` : null;
      if (key) events.push({ key, ts: new Date(s.created_at as string).getTime() });
    }
    events.sort((a, b) => a.ts - b.ts);

    const seqKeys = seq.map((s) => (s.template_id ? `t:${s.template_id}` : `c:${s.cardio_template_id}`));
    day = seq[nextSequenceIndex(seqKeys, events.map((e) => e.key))];
  } else {
    const { data } = await supabase
      .from("routine_days")
      .select("*, templates(id, name, category)")
      .eq("routine_id", active.id)
      .eq("week_number", currentWeek)
      .eq("day_number", routineDay)
      .maybeSingle();
    day = data;
  }

  if (!day) return { routine: active, day: null };

  // If it has a template, pull its exercises so the briefing can preview
  let exercises: { id: string; name: string; body_part: string | null }[] = [];
  if (day.template_id) {
    const { data: tex } = await supabase
      .from("template_exercises")
      .select("position, exercises(id, name, body_part)")
      .eq("template_id", day.template_id)
      .order("position");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exercises = (tex ?? []).map((t: any) => t.exercises);
  }

  // If this is a cardio day, also fetch the cardio template + check if a
  // session has already been logged today
  let cardioTemplate: { id: string; name: string; prescription_notes: string | null } | null = null;
  let loggedToday = false;
  if (day.cardio_template_id) {
    const { data: ct } = await supabase
      .from("cardio_templates")
      .select("id, name, prescription_notes")
      .eq("id", day.cardio_template_id)
      .maybeSingle();
    if (ct) cardioTemplate = ct;
    const todayStr = todayLocal();
    const { data: existing } = await supabase
      .from("cardio_sessions")
      .select("id")
      .eq("performed_on", todayStr)
      .eq("cardio_template_id", day.cardio_template_id)
      .not("manual_metrics", "is", null)
      .limit(1)
      .maybeSingle();
    if (existing) loggedToday = true;
  }

  return {
    routine: { ...active, current_week: currentWeek },
    day: {
      week_number: day.week_number,
      day_number: day.day_number,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      template: (day as any).templates,
      template_id: day.template_id,
      exercises,
      planned_cardio_type: day.planned_cardio_type as string | null,
      planned_cardio_notes: day.planned_cardio_notes as string | null,
      cardio_template_id: day.cardio_template_id as string | null,
      cardio_template: cardioTemplate,
      cardio_logged_today: loggedToday,
      notes: (day.notes as string | null) ?? null,
    },
  };
}

/**
 * Full structure of the user's active routine: every week, every day, every
 * template with its exercises and targets. Used by the AI advisor so it can
 * see the WHOLE program, not just today's session.
 */
export async function getActiveRoutineFull() {
  const { data: active } = await supabase
    .from("routines")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (!active) return null;

  const { data: days } = await supabase
    .from("routine_days")
    .select("*, templates(id, name, category)")
    .eq("routine_id", active.id)
    .order("week_number")
    .order("day_number");

  const templateIds = [
    ...new Set(
      (days ?? [])
        .map((d) => d.template_id as string | null)
        .filter((id): id is string => !!id)
    ),
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let templateExercises: any[] = [];
  if (templateIds.length > 0) {
    const q = (select: string) =>
      supabase
        .from("template_exercises")
        .select(select as "*")
        .in("template_id", templateIds)
        .order("position");
    // Retry without the equipment embed while migration 0017 is unapplied
    // (data is null only on error; an empty result is []).
    let { data } = await q(
      "template_id, position, target_sets, target_reps, exercises(id, name, body_part, is_unilateral, equipment_type, equipment(name, bar_weight))"
    );
    if (!data) {
      ({ data } = await q(
        "template_id, position, target_sets, target_reps, exercises(id, name, body_part, is_unilateral, equipment_type)"
      ));
    }
    templateExercises = data ?? [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exByTemplate = new Map<string, any[]>();
  for (const te of templateExercises) {
    const tid = te.template_id as string;
    if (!exByTemplate.has(tid)) exByTemplate.set(tid, []);
    exByTemplate.get(tid)!.push({
      position: te.position,
      target_sets: te.target_sets,
      target_reps: te.target_reps,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exercise: (te as any).exercises,
    });
  }

  return {
    id: active.id as string,
    name: active.name as string,
    weeks: active.weeks as number,
    schedule: (days ?? []).map((d) => ({
      week_number: d.week_number,
      day_number: d.day_number,
      template_id: d.template_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      template_name: (d as any).templates?.name ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      template_category: (d as any).templates?.category ?? null,
      exercises: d.template_id ? exByTemplate.get(d.template_id as string) ?? [] : [],
      planned_cardio_type: d.planned_cardio_type ?? null,
      planned_cardio_notes: d.planned_cardio_notes ?? null,
    })),
  };
}

export async function getNextPlannedWorkout() {
  const { data: active } = await supabase
    .from("routines")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (!active) return null;

  // Get all routine slots in order — strength (template_id) OR cardio
  // (cardio_template_id). A slot with neither is a rest day and is skipped.
  const { data: slots } = await supabase
    .from("routine_days")
    .select("*, templates(*), cardio_templates(id, name, prescription_notes)")
    .eq("routine_id", active.id)
    .or("template_id.not.is.null,cardio_template_id.not.is.null")
    .order("week_number")
    .order("day_number");

  if (!slots || slots.length === 0) {
    return {
      routine: { id: active.id, name: active.name, weeks: active.weeks },
      next: null,
      reason: "No workouts scheduled in this routine.",
    };
  }

  // Build sequence. Each slot is either a strength day (templateId) or a cardio
  // day (cardioTemplateId). A synthetic per-slot key identifies it for
  // completion/skip matching regardless of type.
  const sequence = slots.map((s) => ({
    weekNumber: s.week_number as number,
    dayNumber: s.day_number as number,
    templateId: s.template_id as string | null,
    cardioTemplateId: s.cardio_template_id as string | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cardioTemplate: (s as any).cardio_templates ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    template: (s as any).templates,
  }));

  // A slot's identity for completion/skip matching: strength → its template_id,
  // cardio → "cardio:<cardio_template_id>". Duplicate templates (Zone 2 filling
  // several slots, or the same day repeating across weeks) are resolved by the
  // sequence engine, which tracks position through ALL events chronologically.
  const slotKey = (s: { templateId: string | null; cardioTemplateId: string | null }) =>
    s.templateId ?? (s.cardioTemplateId ? `cardio:${s.cardioTemplateId}` : null);

  const startedOn = active.started_on as string | null;
  let nextIndex = 0;

  if (startedOn) {
    const templateIds = sequence.map((s) => s.templateId).filter((id): id is string => !!id);
    const cardioTemplateIds = sequence
      .map((s) => s.cardioTemplateId)
      .filter((id): id is string => !!id);

    const [{ data: seqW }, { data: seqC }, { data: seqSkips }] = await Promise.all([
      templateIds.length > 0
        ? supabase
            .from("workouts")
            .select("template_id, created_at")
            .gte("performed_on", startedOn)
            .in("template_id", templateIds)
            .order("created_at", { ascending: true })
            .limit(1000)
        : Promise.resolve({ data: [] }),
      cardioTemplateIds.length > 0
        ? supabase
            .from("cardio_sessions")
            .select("cardio_template_id, created_at")
            .gte("performed_on", startedOn)
            .in("cardio_template_id", cardioTemplateIds)
            .order("created_at", { ascending: true })
            .limit(1000)
        : Promise.resolve({ data: [] }),
      // select("*") tolerates the cardio_template_id column not existing yet
      supabase
        .from("routine_skips")
        .select("*")
        .eq("routine_id", active.id)
        .gte("skipped_on", startedOn)
        .order("created_at", { ascending: true })
        .limit(1000),
    ]);

    const events: { key: string; ts: number }[] = [];
    for (const w of seqW ?? [])
      events.push({ key: w.template_id as string, ts: new Date(w.created_at as string).getTime() });
    for (const c of seqC ?? [])
      events.push({ key: `cardio:${c.cardio_template_id}`, ts: new Date(c.created_at as string).getTime() });
    for (const s of seqSkips ?? []) {
      const key = s.template_id ? (s.template_id as string) : s.cardio_template_id ? `cardio:${s.cardio_template_id}` : null;
      if (key) events.push({ key, ts: new Date(s.created_at as string).getTime() });
    }
    events.sort((a, b) => a.ts - b.ts);

    const slotKeys = sequence.map((s) => slotKey(s) as string);
    nextIndex = nextSequenceIndex(slotKeys, events.map((e) => e.key));
  }

  const next = sequence[nextIndex];
  const nextIsCardio = !next.templateId && !!next.cardioTemplateId;

  // For a strength next: load its exercises with targets. For cardio: none.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let previewExercises: any[] = [];
  if (next.templateId) {
    const q = (select: string) =>
      supabase
        .from("template_exercises")
        .select(select as "*")
        .eq("template_id", next.templateId!)
        .order("position");
    // Retry without the equipment embed while migration 0017 is unapplied.
    let { data: nextExercises } = await q(
      "position, target_sets, target_reps, exercises(*, equipment(id, name, bar_weight))"
    );
    if (!nextExercises) {
      ({ data: nextExercises } = await q("position, target_sets, target_reps, exercises(*)"));
    }
    previewExercises = (nextExercises ?? []).map((row) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...((row as any).exercises),
      targetSets: (row.target_sets as number | null) ?? null,
      targetReps: (row.target_reps as string | null) ?? null,
    }));
  }

  return {
    routine: { id: active.id, name: active.name, weeks: active.weeks },
    next: {
      weekNumber: next.weekNumber,
      dayNumber: next.dayNumber,
      template: next.template,
      exercises: previewExercises,
      // Cardio fields (null for strength days)
      isCardio: nextIsCardio,
      cardioTemplateId: next.cardioTemplateId,
      cardioTemplate: next.cardioTemplate,
    },
    // All scheduled slots so the user can pick a different one if they want
    sequence: sequence.map((s) => ({
      weekNumber: s.weekNumber,
      dayNumber: s.dayNumber,
      template: s.template,
      isCardio: !s.templateId && !!s.cardioTemplateId,
      cardioTemplate: s.cardioTemplate,
      cardioTemplateId: s.cardioTemplateId,
    })),
  };
}
