"use server";

import { supabase } from "@/db";
import { fetchAllRows } from "@/lib/paginate";

export type MuscleVolume = {
  muscle: string; // body_part value: chest, shoulders, biceps, etc.
  volume: number; // sum of reps × load in lbs
  sets: number;
  topExercises: { name: string; volume: number }[];
};

/**
 * Get per-muscle training volume over the given window.
 * Returns volume + top contributing exercises per muscle.
 */
export async function getMuscleVolumes(daysBack: number | null = 30): Promise<{
  windowDays: number | null;
  totalVolume: number;
  byMuscle: Record<string, MuscleVolume>;
}> {
  let startStr: string | null = null;
  if (daysBack != null) {
    const start = new Date();
    start.setDate(start.getDate() - daysBack);
    startStr = start.toISOString().split("T")[0];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllRows<any>((from, to) => {
    let q = supabase
      .from("sets")
      .select("reps, load, exercises!inner(name, body_part), workouts!inner(performed_on)");
    if (startStr) q = q.gte("workouts.performed_on", startStr);
    return q.range(from, to);
  });

  // Aggregate per muscle
  const byMuscle: Record<string, MuscleVolume> = {};
  let total = 0;

  for (const r of rows) {
    const reps = Number(r.reps);
    const load = Number(r.load);
    if (reps <= 0 || load <= 0) continue;
    const vol = reps * load;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = (r as any).exercises;
    const muscle = (ex?.body_part as string) || "other";
    const exName = (ex?.name as string) || "Unknown";

    if (!byMuscle[muscle]) {
      byMuscle[muscle] = { muscle, volume: 0, sets: 0, topExercises: [] };
    }
    byMuscle[muscle].volume += vol;
    byMuscle[muscle].sets += 1;
    total += vol;

    // Track per-exercise volume to compute top contributors later
    const existing = byMuscle[muscle].topExercises.find((e) => e.name === exName);
    if (existing) existing.volume += vol;
    else byMuscle[muscle].topExercises.push({ name: exName, volume: vol });
  }

  // Sort top exercises and limit to top 5
  for (const m of Object.values(byMuscle)) {
    m.topExercises.sort((a, b) => b.volume - a.volume);
    m.topExercises = m.topExercises.slice(0, 5);
  }

  return {
    windowDays: daysBack,
    totalVolume: Math.round(total),
    byMuscle,
  };
}
