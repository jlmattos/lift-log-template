"use server";

import { supabase } from "@/db";
import { revalidatePath } from "next/cache";
import { fetchAllRows } from "@/lib/paginate";
import { calculateE1RM } from "@/lib/e1rm";

export async function logBilateralSet(
  workoutId: string,
  exerciseId: string,
  data: { reps: number; load: number; rpe?: number | null }
) {
  // Get next set_index
  const { data: existing, error: idxError } = await supabase
    .from("sets")
    .select("set_index")
    .eq("workout_id", workoutId)
    .eq("exercise_id", exerciseId)
    .order("set_index", { ascending: false })
    .limit(1);
  // A failed read must not silently fall back to index 1 (duplicate set #).
  if (idxError) throw new Error(idxError.message);

  const nextIndex = (existing?.[0]?.set_index ?? 0) + 1;

  const { data: result, error } = await supabase
    .from("sets")
    .insert({
      workout_id: workoutId,
      exercise_id: exerciseId,
      set_index: nextIndex,
      side: "both",
      reps: data.reps,
      load: data.load,
      rpe: data.rpe ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/");
  return result;
}

export async function logUnilateralSet(
  workoutId: string,
  exerciseId: string,
  data: {
    left: { reps: number; load: number; rpe?: number | null };
    right: { reps: number; load: number; rpe?: number | null };
  }
) {
  // Get next set_index
  const { data: existing, error: idxError } = await supabase
    .from("sets")
    .select("set_index")
    .eq("workout_id", workoutId)
    .eq("exercise_id", exerciseId)
    .order("set_index", { ascending: false })
    .limit(1);
  // A failed read must not silently fall back to index 1 (duplicate set #).
  if (idxError) throw new Error(idxError.message);

  const nextIndex = (existing?.[0]?.set_index ?? 0) + 1;

  // Insert both sides
  const { data: result, error } = await supabase
    .from("sets")
    .insert([
      {
        workout_id: workoutId,
        exercise_id: exerciseId,
        set_index: nextIndex,
        side: "left",
        reps: data.left.reps,
        load: data.left.load,
        rpe: data.left.rpe ?? null,
      },
      {
        workout_id: workoutId,
        exercise_id: exerciseId,
        set_index: nextIndex,
        side: "right",
        reps: data.right.reps,
        load: data.right.load,
        rpe: data.right.rpe ?? null,
      },
    ])
    .select();

  if (error) throw new Error(error.message);

  revalidatePath("/");
  return result;
}

export async function getSetsForExercise(workoutId: string, exerciseId: string) {
  const { data, error } = await supabase
    .from("sets")
    .select("*")
    .eq("workout_id", workoutId)
    .eq("exercise_id", exerciseId)
    .order("set_index")
    .order("side");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getLastSetForExercise(exerciseId: string) {
  const { data } = await supabase
    .from("sets")
    .select("*")
    .eq("exercise_id", exerciseId)
    .order("created_at", { ascending: false })
    .limit(2);

  return data ?? [];
}

/**
 * Get the most recent COMPLETE session for an exercise (all sets from the last workout).
 * Excludes the current workout if `excludeWorkoutId` provided.
 */
export async function getLastSession(
  exerciseId: string,
  excludeWorkoutId?: string
) {
  // Find the most recent workout that has sets for this exercise (excluding current)
  let query = supabase
    .from("sets")
    .select("workout_id, workouts!inner(performed_on)")
    .eq("exercise_id", exerciseId)
    .order("workouts(performed_on)", { ascending: false })
    .limit(1);

  if (excludeWorkoutId) {
    query = query.neq("workout_id", excludeWorkoutId);
  }

  const { data: latest } = await query;
  if (!latest || latest.length === 0) return null;

  const workoutId = latest[0].workout_id as string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const performedOn = (latest[0] as any).workouts.performed_on as string;

  // Get all sets from that workout for this exercise
  const { data: sets } = await supabase
    .from("sets")
    .select("*")
    .eq("workout_id", workoutId)
    .eq("exercise_id", exerciseId)
    .order("set_index")
    .order("side");

  return {
    performedOn,
    sets: sets ?? [],
  };
}

/**
 * Bulk: get last session for many exercises in just TWO queries total.
 * Returns map: exerciseId → { performedOn, sets }
 */
export async function getLastSessionsForExercises(
  exerciseIds: string[],
  excludeWorkoutId?: string
) {
  if (exerciseIds.length === 0) return {};

  // 1. Find the most recent workout date per exercise (where exercise was
  // logged). One row per set, so a full day's exercises (plus the next-day
  // preview) exceed Supabase's silent 1000-row cap — paginate, or exercises
  // whose rows fall past the cap lose their history entirely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates = await fetchAllRows<any>((from, to) => {
    let q1 = supabase
      .from("sets")
      .select("exercise_id, workout_id, workouts!inner(id, performed_on)")
      .in("exercise_id", exerciseIds);
    if (excludeWorkoutId) q1 = q1.neq("workout_id", excludeWorkoutId);
    return q1.order("id").range(from, to);
  });
  if (candidates.length === 0) return {};

  // For each exercise, keep the TWO most recent workouts (latest + prior) —
  // candidates has one row per set, so dedupe by workout first.
  const workoutsByEx = new Map<string, Map<string, string>>(); // exId → workoutId → date
  for (const c of candidates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const date = (c as any).workouts.performed_on as string;
    const exId = c.exercise_id as string;
    if (!workoutsByEx.has(exId)) workoutsByEx.set(exId, new Map());
    workoutsByEx.get(exId)!.set(c.workout_id as string, date);
  }
  const recentByEx = new Map<string, { workoutId: string; performedOn: string }[]>();
  for (const [exId, workouts] of workoutsByEx) {
    const top2 = Array.from(workouts.entries())
      .map(([workoutId, performedOn]) => ({ workoutId, performedOn }))
      .sort((a, b) => (a.performedOn < b.performedOn ? 1 : -1))
      .slice(0, 2);
    recentByEx.set(exId, top2);
  }

  // 2. Fetch all sets for those (exercise, workout) pairs — up to 2 workouts
  // per exercise, which can also brush the 1000-row cap on a big day.
  const workoutIds = [
    ...new Set(Array.from(recentByEx.values()).flat().map((v) => v.workoutId)),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allSets = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select("*")
      .in("workout_id", workoutIds)
      .order("id")
      .range(from, to)
  );

  const setsFor = (exId: string, workoutId: string) =>
    allSets.filter((s) => s.workout_id === workoutId && s.exercise_id === exId);

  const result: Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { performedOn: string; sets: any[]; prior: { performedOn: string; sets: any[] } | null }
  > = {};
  for (const [exId, recents] of recentByEx) {
    const [latest, prior] = recents;
    result[exId] = {
      performedOn: latest.performedOn,
      sets: setsFor(exId, latest.workoutId),
      prior: prior ? { performedOn: prior.performedOn, sets: setsFor(exId, prior.workoutId) } : null,
    };
  }

  return result;
}

/**
 * Returns best e1RM ever for an exercise (excluding optionally a workout).
 * For unilateral exercises, returns separate L and R bests.
 */
export async function getBestE1RM(
  exerciseId: string,
  isUnilateral: boolean,
  excludeWorkoutId?: string
): Promise<{
  both: { e1rm: number; reps: number; load: number; date: string } | null;
  left: { e1rm: number; reps: number; load: number; date: string } | null;
  right: { e1rm: number; reps: number; load: number; date: string } | null;
}> {
  // A long-trained lift's full set history can pass the 1000-row cap — a
  // truncated read here would silently report stale PRs, so paginate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllRows<any>((from, to) => {
    let query = supabase
      .from("sets")
      .select("reps, load, side, workouts!inner(performed_on)")
      .eq("exercise_id", exerciseId);
    if (excludeWorkoutId) {
      query = query.neq("workout_id", excludeWorkoutId);
    }
    return query.order("id").range(from, to);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findBest = (sets: any[]) => {
    let best: { e1rm: number; reps: number; load: number; date: string } | null = null;
    for (const s of sets) {
      const load = Number(s.load);
      const reps = Number(s.reps);
      if (reps <= 0 || load <= 0) continue;
      const e1rm = calculateE1RM(load, reps);
      if (!best || e1rm > best.e1rm) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        best = { e1rm, reps, load, date: (s as any).workouts.performed_on };
      }
    }
    return best;
  };

  const allRows = rows ?? [];
  if (isUnilateral) {
    return {
      both: null,
      left: findBest(allRows.filter((r) => r.side === "left")),
      right: findBest(allRows.filter((r) => r.side === "right")),
    };
  }

  return {
    both: findBest(allRows.filter((r) => r.side === "both")),
    left: null,
    right: null,
  };
}

/**
 * Detect PRs that were set today across all exercises.
 * Returns list of { exercise, side, e1rm, previousE1rm }
 */
export async function getRecentPRs(daysBack = 30) {
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  const startStr = start.toISOString().split("T")[0];

  // Get all sets in window with workout date and exercise info. The window
  // crosses the 1000-row cap at current training volume — paginate (stable
  // id order keeps pages from overlapping).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select(
        "reps, load, side, workouts!inner(id, performed_on), exercises!inner(id, name, is_unilateral, equipment_type)"
      )
      .gte("workouts.performed_on", startStr)
      .order("id")
      .range(from, to)
  );

  if (rows.length === 0) return [];

  // For each (exercise, side), find best e1rm in window and the date it happened
  const byKey = new Map<
    string,
    {
      exerciseId: string;
      exerciseName: string;
      isUnilateral: boolean;
      side: string;
      e1rm: number;
      reps: number;
      load: number;
      date: string;
    }
  >();

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = (row as any).exercises;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (row as any).workouts;
    const load = Number(row.load);
    const reps = Number(row.reps);
    if (reps <= 0 || load <= 0) continue;
    const e1rm = calculateE1RM(load, reps);
    const key = `${ex.id}-${row.side}`;
    const existing = byKey.get(key);
    if (!existing || e1rm > existing.e1rm) {
      byKey.set(key, {
        exerciseId: ex.id,
        exerciseName: ex.name,
        isUnilateral: ex.is_unilateral,
        side: row.side,
        e1rm,
        reps,
        load,
        date: w.performed_on,
      });
    }
  }

  // For each candidate, check whether it beats anything PRIOR to its date.
  // BATCHED: one query for all sets older than window start, then look up in-memory.
  const candidates = Array.from(byKey.values());
  if (candidates.length === 0) return [];

  const exerciseIds = [...new Set(candidates.map((c) => c.exerciseId))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priorRows = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select("exercise_id, side, reps, load, workouts!inner(performed_on)")
      .in("exercise_id", exerciseIds)
      .lt("workouts.performed_on", startStr)
      .range(from, to),
  );

  // priorBest[exerciseId-side] = best e1rm before window start
  const priorBest = new Map<string, number>();
  for (const p of priorRows ?? []) {
    const pload = Number(p.load);
    const preps = Number(p.reps);
    if (preps <= 0 || pload <= 0) continue;
    const pe = calculateE1RM(pload, preps);
    const key = `${p.exercise_id}-${p.side}`;
    const existing = priorBest.get(key) ?? 0;
    if (pe > existing) priorBest.set(key, pe);
  }

  // Also check earlier-in-window sets (a PR set Tuesday should beat sets from Monday in same window)
  // Easier: re-iterate rows in chronological order, tracking running best, and flag whenever current > running.
  // For simplicity here we'll just use prior-to-window as the bar — most PRs are clear wins.
  const prs = candidates.filter((c) => c.e1rm > (priorBest.get(`${c.exerciseId}-${c.side}`) ?? 0));

  return prs.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Bulk: get PR status for a list of exercises in TODAY's session, in 2 queries total.
 */
export async function getTodaysPRs(
  workoutId: string,
  exerciseInfo: { id: string; isUnilateral: boolean }[]
) {
  const result: Record<string, { both?: boolean; left?: boolean; right?: boolean }> = {};
  if (exerciseInfo.length === 0) return result;

  const exerciseIds = exerciseInfo.map((e) => e.id);

  const calc = (s: { reps: number; load: number | string }) =>
    calculateE1RM(Number(s.load), Number(s.reps));

  // 1. Today's sets for all exercises
  const { data: todays } = await supabase
    .from("sets")
    .select("exercise_id, side, reps, load")
    .eq("workout_id", workoutId)
    .in("exercise_id", exerciseIds);

  // 2. All prior sets for those exercises (excluding today). A day's
  // exercises sum to well over the 1000-row cap in lifetime sets — truncation
  // here meant false PR badges (prior bests computed from partial history).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priors = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select("exercise_id, side, reps, load")
      .in("exercise_id", exerciseIds)
      .neq("workout_id", workoutId)
      .order("id")
      .range(from, to)
  );

  // priorBest[exerciseId-side] = best e1rm prior
  const priorBest = new Map<string, number>();
  for (const p of priors) {
    const e = calc(p);
    if (e <= 0) continue;
    const key = `${p.exercise_id}-${p.side}`;
    if (e > (priorBest.get(key) ?? 0)) priorBest.set(key, e);
  }

  // Today's max per (exercise, side)
  const todayMax = new Map<string, number>();
  for (const t of todays ?? []) {
    const e = calc(t);
    if (e <= 0) continue;
    const key = `${t.exercise_id}-${t.side}`;
    if (e > (todayMax.get(key) ?? 0)) todayMax.set(key, e);
  }

  // Compare and flag
  for (const ex of exerciseInfo) {
    const flags: { both?: boolean; left?: boolean; right?: boolean } = {};
    if (ex.isUnilateral) {
      const lt = todayMax.get(`${ex.id}-left`) ?? 0;
      const rt = todayMax.get(`${ex.id}-right`) ?? 0;
      const lp = priorBest.get(`${ex.id}-left`) ?? 0;
      const rp = priorBest.get(`${ex.id}-right`) ?? 0;
      if (lt > lp && lt > 0) flags.left = true;
      if (rt > rp && rt > 0) flags.right = true;
    } else {
      const bt = todayMax.get(`${ex.id}-both`) ?? 0;
      const bp = priorBest.get(`${ex.id}-both`) ?? 0;
      if (bt > bp && bt > 0) flags.both = true;
    }
    if (Object.keys(flags).length > 0) result[ex.id] = flags;
  }

  return result;
}

export async function updateBilateralSet(
  setId: string,
  data: { reps: number; load: number; rpe?: number | null }
) {
  const { error } = await supabase
    .from("sets")
    .update({
      reps: data.reps,
      load: data.load,
      rpe: data.rpe ?? null,
    })
    .eq("id", setId);

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function updateUnilateralSet(
  workoutId: string,
  exerciseId: string,
  setIndex: number,
  data: {
    left: { reps: number; load: number; rpe?: number | null };
    right: { reps: number; load: number; rpe?: number | null };
  }
) {
  const updates = [
    supabase
      .from("sets")
      .update({
        reps: data.left.reps,
        load: data.left.load,
        rpe: data.left.rpe ?? null,
      })
      .eq("workout_id", workoutId)
      .eq("exercise_id", exerciseId)
      .eq("set_index", setIndex)
      .eq("side", "left"),
    supabase
      .from("sets")
      .update({
        reps: data.right.reps,
        load: data.right.load,
        rpe: data.right.rpe ?? null,
      })
      .eq("workout_id", workoutId)
      .eq("exercise_id", exerciseId)
      .eq("set_index", setIndex)
      .eq("side", "right"),
  ];

  const results = await Promise.all(updates);
  for (const r of results) {
    if (r.error) throw new Error(r.error.message);
  }

  revalidatePath("/");
}

export async function deleteSetRound(
  workoutId: string,
  exerciseId: string,
  setIndex: number
) {
  // Deletes the set(s) at this set_index (one row for bilateral, two for unilateral)
  const { error } = await supabase
    .from("sets")
    .delete()
    .eq("workout_id", workoutId)
    .eq("exercise_id", exerciseId)
    .eq("set_index", setIndex);

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function getExerciseHistory(exerciseId: string, limit = 10) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sets = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select("*, workouts!inner(performed_on)")
      .eq("exercise_id", exerciseId)
      .range(from, to),
  );

  if (sets.length === 0) return [];

  // Group by workout date
  const sessionMap = new Map<
    string,
    {
      performedOn: string;
      sets: {
        setIndex: number;
        side: string;
        reps: number;
        load: string;
        rpe: string | null;
      }[];
    }
  >();

  for (const row of sets) {
    const workout = row.workouts as unknown as { performed_on: string };
    const dateKey = workout.performed_on;
    if (!sessionMap.has(dateKey)) {
      sessionMap.set(dateKey, { performedOn: dateKey, sets: [] });
    }
    sessionMap.get(dateKey)!.sets.push({
      setIndex: row.set_index,
      side: row.side,
      reps: row.reps,
      load: String(row.load),
      rpe: row.rpe != null ? String(row.rpe) : null,
    });
  }

  // Sort sessions by workout date DESC, then take most-recent N.
  // (Don't rely on set insertion order — back-filled data with identical
  // created_at can return in arbitrary order from Supabase.)
  return Array.from(sessionMap.values())
    .sort((a, b) => (a.performedOn < b.performedOn ? 1 : -1))
    .slice(0, limit);
}
