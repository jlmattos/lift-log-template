"use server";

import { supabase } from "@/db";
import { todayLocal } from "@/lib/dates";
import { revalidatePath } from "next/cache";
import { bodyPartCategory } from "@/lib/body-parts";
import { fetchAllRows } from "@/lib/paginate";
import type { ExerciseRow, SetRow, SetWithExercise, WorkoutRow } from "@/db/types";

export async function finishWorkout(workoutId: string) {
  const { error } = await supabase
    .from("workouts")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", workoutId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/progress");
}

export async function unfinishWorkout(workoutId: string) {
  const { error } = await supabase
    .from("workouts")
    .update({ completed_at: null })
    .eq("id", workoutId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/progress");
}

export async function updateWorkoutNotes(workoutId: string, notes: string) {
  const trimmed = notes.trim();
  const { error } = await supabase
    .from("workouts")
    .update({ notes: trimmed || null })
    .eq("id", workoutId);

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/history/${workoutId}`);
  revalidatePath("/progress");
}

export async function getOrCreateTodayWorkout() {
  const today = todayLocal();

  // Try to find existing
  const { data: existing } = await supabase
    .from("workouts")
    .select("*")
    .eq("performed_on", today)
    .single();

  if (existing) return existing;

  // Create new
  const { data, error } = await supabase
    .from("workouts")
    .insert({ performed_on: today })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/");
  return data;
}

/**
 * Swap a planned exercise out of today's workout: record a per-workout skip so
 * it stops appearing in "up next". The replacement is logged normally. Scoped
 * to this workout only — the template and future sessions are untouched.
 * Tolerates the table being absent (migration 0011 not yet applied).
 */
export async function skipPlannedExercise(workoutId: string, exerciseId: string) {
  const { error } = await supabase
    .from("workout_exercise_skips")
    .upsert(
      { workout_id: workoutId, exercise_id: exerciseId },
      { onConflict: "workout_id,exercise_id" },
    );
  // PGRST205 / 42P01 = table missing (pre-migration) — degrade gracefully.
  if (error && !isMissingTableError(error)) throw new Error(error.message);
  revalidatePath("/");
}

function isMissingTableError(error: { code?: string; message?: string }): boolean {
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const m = error.message ?? "";
  return /workout_exercise_skips/.test(m) && /(does not exist|could not find the table)/i.test(m);
}

/**
 * Sets (or template_exercises) with their exercise and its assigned equipment.
 * PGRST200 means migration 0017 (equipment table) isn't applied yet — retry
 * without the embed so logged sets never vanish behind a schema lag; exercises
 * then lack an `equipment` key and resolveBar falls back to the type default.
 */
async function selectWithEquipmentFallback<T>(
  build: (select: string) => PromiseLike<{ data: T | null; error: { code?: string } | null }>
): Promise<T | null> {
  const first = await build("*, exercises(*, equipment(id, name, bar_weight))");
  let data = first.data;
  if (first.error?.code === "PGRST200") {
    ({ data } = await build("*, exercises(*)"));
  }
  return data;
}

/** One template_exercises row as the Today page needs it. */
export type PlanEntry = {
  targetSets: number | null;
  targetReps: string | null;
  /** Template order — drives Today's exercise order so groups never split. */
  position: number;
  /** Superset/tri-set membership; adjacent equal blocks form a group. */
  block: number | null;
  /** Rest after a set of this exercise (group rest when it's the last member). */
  restSeconds: number | null;
  /** Duration for time-based sets (holds, rower finisher). */
  timedSeconds: number | null;
};

export async function getTodayWorkoutWithSets() {
  const today = todayLocal();

  const { data: workout } = await supabase
    .from("workouts")
    .select("*")
    .eq("performed_on", today)
    .single();

  if (!workout) return null;

  const workoutSets = await selectWithEquipmentFallback((select) =>
    supabase
      .from("sets")
      .select(select as "*")
      .eq("workout_id", workout.id)
      .order("exercise_id")
      .order("set_index")
      .order("side")
  );

  const exerciseMap = new Map<string, { exercise: ExerciseRow; sets: SetRow[] }>();

  for (const row of (workoutSets ?? []) as SetWithExercise[]) {
    const { exercises: exercise, ...setData } = row;
    const exerciseId = exercise.id;
    if (!exerciseMap.has(exerciseId)) {
      exerciseMap.set(exerciseId, { exercise, sets: [] });
    }
    exerciseMap.get(exerciseId)!.sets.push(setData);
  }

  // If workout has a template, load planned exercises (those in template but not yet logged)
  // and per-exercise targets (which we want for BOTH logged and planned)
  let template:
    | {
        id: string;
        name: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        plannedExercises: any[];
        targetsByExercise: Record<string, PlanEntry>;
      }
    | null = null;

  if (workout.template_id) {
    const { data: t } = await supabase
      .from("templates")
      .select("*")
      .eq("id", workout.template_id)
      .single();

    if (t) {
      const tex = await selectWithEquipmentFallback((select) =>
        supabase
          .from("template_exercises")
          .select(select as "*")
          .eq("template_id", workout.template_id)
          .order("position")
      );

      const loggedIds = new Set(Array.from(exerciseMap.keys()));

      // Per-workout swaps: exercises the user skipped for THIS session drop out
      // of the planned list. Tolerate the table being absent (pre-migration).
      const skippedIds = new Set<string>();
      const { data: skips } = await supabase
        .from("workout_exercise_skips")
        .select("exercise_id")
        .eq("workout_id", workout.id);
      for (const s of skips ?? []) skippedIds.add(s.exercise_id as string);

      const targetsByExercise: Record<string, PlanEntry> = {};
      const planned = [];
      for (const row of tex ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ex = (row as any).exercises;
        if (!ex) continue;
        targetsByExercise[ex.id] = {
          targetSets: (row.target_sets as number | null) ?? null,
          targetReps: (row.target_reps as string | null) ?? null,
          position: (row.position as number) ?? 0,
          // Grouping + timers (migration 0019); undefined before it runs.
          block: (row.block as number | null | undefined) ?? null,
          restSeconds: (row.rest_seconds as number | null | undefined) ?? null,
          timedSeconds: (row.timed_seconds as number | null | undefined) ?? null,
        };
        // Skip if already logged OR swapped out for this workout.
        if (!loggedIds.has(ex.id) && !skippedIds.has(ex.id)) planned.push(ex);
      }

      template = {
        id: t.id as string,
        name: t.name as string,
        plannedExercises: planned,
        targetsByExercise,
      };
    }
  }

  return {
    workout,
    exercises: Array.from(exerciseMap.values()),
    template,
  };
}

/**
 * Get aggregated progress data: stats, heatmap, weekly volume, top exercises.
 * Configurable lookback window. Default 30 days for fast page load —
 * pass larger value for full analytics view.
 */
export async function getProgressData(daysBack = 30) {
  const now = new Date();
  const startOfWindow = new Date();
  startOfWindow.setDate(now.getDate() - daysBack);
  const startStr = startOfWindow.toISOString().split("T")[0];

  // Pull all sets joined with workout date + exercise info within the window.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select("reps, load, workouts!inner(id, performed_on), exercises!inner(id, name, body_part)")
      .gte("workouts.performed_on", startStr)
      .range(from, to),
  );

  // Build per-day map
  const byDate = new Map<string, { volume: number; workoutId: string; setCount: number; byBodyPart: Record<string, number> }>();
  const byExercise = new Map<string, { name: string; sessions: Set<string>; totalVolume: number }>();

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (row as any).workouts;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = (row as any).exercises;
    const date = w.performed_on as string;
    const volume = Number(row.reps) * Number(row.load);
    // Roll up specific muscle groups → broad category (push/pull/legs/core/other)
    const category = bodyPartCategory(ex.body_part as string);

    if (!byDate.has(date)) {
      byDate.set(date, { volume: 0, workoutId: w.id, setCount: 0, byBodyPart: {} });
    }
    const d = byDate.get(date)!;
    d.volume += volume;
    d.setCount += 1;
    d.byBodyPart[category] = (d.byBodyPart[category] ?? 0) + volume;

    if (!byExercise.has(ex.id)) {
      byExercise.set(ex.id, { name: ex.name, sessions: new Set(), totalVolume: 0 });
    }
    const e = byExercise.get(ex.id)!;
    e.sessions.add(w.id);
    e.totalVolume += volume;
  }

  // Reference points for weekly aggregation below.
  const todayCopy = new Date(now);
  todayCopy.setHours(0, 0, 0, 0);
  const dayOfWeek = todayCopy.getDay();

  // Weekly volume — last 8 weeks (with body part breakdown)
  const weekly: {
    weekStart: string;
    weekLabel: string;
    volume: number;
    sessions: number;
    push: number;
    pull: number;
    legs: number;
    core: number;
    other: number;
  }[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekEnd = new Date(todayCopy);
    weekEnd.setDate(todayCopy.getDate() - i * 7 + (6 - dayOfWeek));
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);

    let vol = 0;
    let sessions = 0;
    const bp: Record<string, number> = { push: 0, pull: 0, legs: 0, core: 0, other: 0 };
    for (let j = 0; j < 7; j++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + j);
      const ds = d.toISOString().split("T")[0];
      const day = byDate.get(ds);
      if (day) {
        vol += day.volume;
        sessions += 1;
        for (const [part, v] of Object.entries(day.byBodyPart)) {
          bp[part] = (bp[part] ?? 0) + v;
        }
      }
    }

    weekly.push({
      weekStart: weekStart.toISOString().split("T")[0],
      weekLabel: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      volume: Math.round(vol),
      sessions,
      push: Math.round(bp.push),
      pull: Math.round(bp.pull),
      legs: Math.round(bp.legs),
      core: Math.round(bp.core),
      other: Math.round(bp.other),
    });
  }

  // This week vs last week stats
  const thisWeek = weekly[weekly.length - 1];
  const lastWeek = weekly[weekly.length - 2];

  // Top exercises: by session count
  const topExercises = Array.from(byExercise.entries())
    .map(([id, e]) => ({
      id,
      name: e.name,
      sessions: e.sessions.size,
      totalVolume: Math.round(e.totalVolume),
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 5);

  // Total in window
  const totalWorkouts = byDate.size;
  const totalSets = Array.from(byDate.values()).reduce((sum, d) => sum + d.setCount, 0);
  const totalVolume = Math.round(
    Array.from(byDate.values()).reduce((sum, d) => sum + d.volume, 0)
  );

  return {
    thisWeek,
    lastWeek,
    weekly,
    topExercises,
    totals: { workouts: totalWorkouts, sets: totalSets, volume: totalVolume, days: daysBack },
  };
}

export type HeatmapCell = {
  date: string;
  isToday: boolean;
  isFuture: boolean;
  strengthVolume: number;
  workoutId: string | null;
  setCount: number;
  exercises: string[];
  cardio: { type: string; name: string | null; durationMin: number; load: number }[];
};

/**
 * Build the 12-week (84-day) training calendar with per-day strength + cardio
 * detail. Independent of the progress window selector so the calendar always
 * reflects a fixed 12 weeks ending this Saturday.
 */
export async function getHeatmapCalendar(): Promise<HeatmapCell[]> {
  const now = new Date();
  const todayCopy = new Date(now);
  todayCopy.setHours(0, 0, 0, 0);
  const dayOfWeek = todayCopy.getDay();
  const endDate = new Date(todayCopy);
  endDate.setDate(todayCopy.getDate() + (6 - dayOfWeek)); // Saturday of this week
  const start = new Date(endDate);
  start.setDate(endDate.getDate() - 12 * 7 + 1);
  const startStr = start.toISOString().split("T")[0];

  // Strength sets within the window.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select("reps, load, workouts!inner(id, performed_on), exercises!inner(name)")
      .gte("workouts.performed_on", startStr)
      .range(from, to),
  );

  const { data: cardioRows, error: cardioErr } = await supabase
    .from("cardio_sessions")
    .select("performed_on, type, name, duration_min, estimated_load")
    .gte("performed_on", startStr);
  if (cardioErr) console.error("getHeatmapCalendar cardio error:", cardioErr.message);

  type DayAgg = {
    volume: number;
    workoutId: string | null;
    setCount: number;
    exercises: Set<string>;
    cardio: { type: string; name: string | null; durationMin: number; load: number }[];
  };
  const byDate = new Map<string, DayAgg>();
  const ensure = (date: string): DayAgg => {
    let d = byDate.get(date);
    if (!d) {
      d = { volume: 0, workoutId: null, setCount: 0, exercises: new Set(), cardio: [] };
      byDate.set(date, d);
    }
    return d;
  };

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (row as any).workouts;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = (row as any).exercises;
    const d = ensure(w.performed_on as string);
    d.volume += Number(row.reps) * Number(row.load);
    d.setCount += 1;
    d.workoutId = w.id;
    if (ex?.name) d.exercises.add(ex.name as string);
  }

  for (const c of cardioRows ?? []) {
    const d = ensure(c.performed_on as string);
    d.cardio.push({
      type: c.type as string,
      name: (c.name as string | null) ?? null,
      durationMin: Number(c.duration_min),
      load: Number(c.estimated_load ?? 0),
    });
  }

  const todayStr = todayCopy.toISOString().split("T")[0];
  const cells: HeatmapCell[] = [];
  for (let i = 0; i < 12 * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const ds = d.toISOString().split("T")[0];
    const agg = byDate.get(ds);
    cells.push({
      date: ds,
      isToday: ds === todayStr,
      isFuture: d > todayCopy,
      strengthVolume: agg ? Math.round(agg.volume) : 0,
      workoutId: agg?.workoutId ?? null,
      setCount: agg?.setCount ?? 0,
      exercises: agg ? Array.from(agg.exercises) : [],
      cardio: agg?.cardio ?? [],
    });
  }

  return cells;
}

export async function deleteWorkout(workoutId: string) {
  // CASCADE on sets foreign key will remove all sets
  const { error } = await supabase
    .from("workouts")
    .delete()
    .eq("id", workoutId);

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/history");
}

/**
 * List workouts with their exercise/set counts.
 * Default limit 60 (most recent) — pass a higher limit for full history.
 * Single batched query instead of N+1.
 */
export async function listWorkouts(limit = 60) {
  const { data: allWorkouts, error } = await supabase
    .from("workouts")
    .select("*, sets(exercise_id, set_index)")
    .order("performed_on", { ascending: false })
    .limit(limit);

  if (error || !allWorkouts) return [];

  type WorkoutWithSetStubs = WorkoutRow & {
    sets: { exercise_id: string; set_index: number }[];
  };

  return (allWorkouts as WorkoutWithSetStubs[]).map((w) => {
    const { sets, ...rest } = w;
    const setList = sets ?? [];
    const exerciseIds = new Set(setList.map((s) => s.exercise_id));
    const setKeys = new Set(setList.map((s) => `${s.exercise_id}-${s.set_index}`));
    return {
      ...rest,
      exerciseCount: exerciseIds.size,
      setCount: setKeys.size,
    };
  });
}

export async function getWorkoutWithSets(workoutId: string) {
  const { data: workout } = await supabase
    .from("workouts")
    .select("*")
    .eq("id", workoutId)
    .single();

  if (!workout) return null;

  const workoutSets = await selectWithEquipmentFallback((select) =>
    supabase
      .from("sets")
      .select(select as "*")
      .eq("workout_id", workout.id)
      .order("exercise_id")
      .order("set_index")
      .order("side")
  );

  if (!workoutSets) return { workout, exercises: [] };

  const exerciseMap = new Map<string, { exercise: ExerciseRow; sets: SetRow[] }>();

  for (const row of workoutSets as SetWithExercise[]) {
    const { exercises: exercise, ...setData } = row;
    const exerciseId = exercise.id;
    if (!exerciseMap.has(exerciseId)) {
      exerciseMap.set(exerciseId, { exercise, sets: [] });
    }
    exerciseMap.get(exerciseId)!.sets.push(setData);
  }

  return {
    workout,
    exercises: Array.from(exerciseMap.values()),
  };
}
