"use server";

import { supabase } from "@/db";
import { fetchAllRows } from "@/lib/paginate";
import { calculateE1RM } from "@/lib/e1rm";

export type PREvent = {
  exerciseId: string;
  exerciseName: string;
  isUnilateral: boolean;
  bodyPart: string | null;
  side: "both" | "left" | "right";
  e1rm: number;
  reps: number;
  load: number;
  date: string;
  // How big was the jump over the previous PR (lbs e1RM)
  jumpLbs: number;
  // Whether this PR is still standing (no later set beat it)
  isCurrent: boolean;
};

/**
 * Walk every set chronologically; each time the e1RM for (exercise, side)
 * exceeds the running best, that's a PR. Returns all PRs ever, newest first.
 */
export async function getAllPRs(): Promise<PREvent[]> {
  // Fetch every set ever, joined with exercise + workout date
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select("exercise_id, side, reps, load, workouts!inner(performed_on), exercises!inner(id, name, is_unilateral, body_part)")
      .range(from, to),
  );

  // Sort sets chronologically by workout date, then by set order
  rows.sort((a, b) => {
    const da = a.workouts.performed_on;
    const db = b.workouts.performed_on;
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
  });

  // Running best per (exercise, side); each surpassing event = PR
  const running = new Map<string, number>();
  const events: PREvent[] = [];

  for (const r of rows) {
    const ex = r.exercises;
    const reps = Number(r.reps);
    const load = Number(r.load);
    if (reps <= 0 || load <= 0) continue;
    const e1rm = calculateE1RM(load, reps);
    const key = `${ex.id}-${r.side}`;
    const prev = running.get(key) ?? 0;
    if (e1rm > prev) {
      events.push({
        exerciseId: ex.id,
        exerciseName: ex.name,
        isUnilateral: ex.is_unilateral,
        bodyPart: ex.body_part ?? null,
        side: r.side,
        e1rm: Math.round(e1rm * 10) / 10,
        reps,
        load,
        date: r.workouts.performed_on,
        jumpLbs: Math.round((e1rm - prev) * 10) / 10,
        isCurrent: false, // filled in below
      });
      running.set(key, e1rm);
    }
  }

  // Mark the most-recent PR for each (exercise, side) as "current"
  const seen = new Set<string>();
  for (let i = events.length - 1; i >= 0; i--) {
    const key = `${events[i].exerciseId}-${events[i].side}`;
    if (!seen.has(key)) {
      events[i].isCurrent = true;
      seen.add(key);
    }
  }

  // Return newest first
  return events.reverse();
}
