"use server";

import { supabase } from "@/db";
import { todayLocal } from "@/lib/dates";
import { fetchAllRows } from "@/lib/paginate";
import { revalidatePath } from "next/cache";
import {
  type StandardLift,
  ADD_BODYWEIGHT_LIFTS,
  computeTier,
} from "@/lib/strength-standards";
import { calculateE1RM } from "@/lib/e1rm";

// ─── Bodyweight ─────────────────────────────────────────────────────

export type BodyweightLog = {
  id: string;
  measured_on: string;
  weight_lbs: number;
  notes: string | null;
  created_at: string;
};

export async function logBodyweight(weightLbs: number, date?: string, notes?: string) {
  const d = date ?? todayLocal();
  if (weightLbs <= 0) throw new Error("Weight must be positive");

  // Upsert (delete then insert)
  await supabase.from("bodyweight_logs").delete().eq("measured_on", d);

  const { error } = await supabase
    .from("bodyweight_logs")
    .insert({
      measured_on: d,
      weight_lbs: weightLbs,
      notes: notes?.trim() || null,
    });
  if (error) throw new Error(error.message);

  revalidatePath("/strength");
  revalidatePath("/bodyweight");
  revalidatePath("/");
}

export async function deleteBodyweight(id: string) {
  const { error } = await supabase.from("bodyweight_logs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/strength");
  revalidatePath("/bodyweight");
}

export async function listBodyweightLogs(limit = 90): Promise<BodyweightLog[]> {
  const { data, error } = await supabase
    .from("bodyweight_logs")
    .select("*")
    .order("measured_on", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as BodyweightLog[];
}

export async function getLatestBodyweight(): Promise<BodyweightLog | null> {
  const { data } = await supabase
    .from("bodyweight_logs")
    .select("*")
    .order("measured_on", { ascending: false })
    .limit(1);
  return (data?.[0] as BodyweightLog) ?? null;
}

// ─── Profile (single row) ───────────────────────────────────────────

export async function getProfile(): Promise<{ sex: "male" | "female" | null }> {
  const { data } = await supabase.from("user_profile").select("*").maybeSingle();
  return { sex: (data?.sex as "male" | "female" | null) ?? null };
}

export async function setProfileSex(sex: "male" | "female") {
  const { data: existing } = await supabase.from("user_profile").select("id").maybeSingle();
  if (existing) {
    await supabase.from("user_profile").update({ sex }).eq("id", existing.id);
  } else {
    await supabase.from("user_profile").insert({ sex });
  }
  revalidatePath("/strength");
}

// ─── Benchmark lifts ────────────────────────────────────────────────

export type BenchmarkLift = {
  id: string;
  exercise_id: string;
  standard_lift: StandardLift;
  position: number;
};

export async function listBenchmarks() {
  const { data } = await supabase
    .from("benchmark_lifts")
    .select("*, exercises(id, name, is_unilateral, equipment_type, body_part)")
    .order("position");
  return (data ?? []).map((b) => ({
    id: b.id as string,
    exercise_id: b.exercise_id as string,
    standard_lift: b.standard_lift as StandardLift,
    position: b.position as number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exercise: (b as any).exercises,
  }));
}

export async function addBenchmark(exerciseId: string, standardLift: StandardLift) {
  const { data: existing } = await supabase
    .from("benchmark_lifts")
    .select("position")
    .order("position", { ascending: false })
    .limit(1);
  const nextPos = (existing?.[0]?.position ?? 0) + 1;

  const { error } = await supabase.from("benchmark_lifts").insert({
    exercise_id: exerciseId,
    standard_lift: standardLift,
    position: nextPos,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/strength");
}

export async function removeBenchmark(id: string) {
  const { error } = await supabase.from("benchmark_lifts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/strength");
}

// ─── Computed: full strength dashboard ─────────────────────────────

/**
 * For each benchmark, compute best e1RM and current tier vs bodyweight standard.
 *
 * @param windowKey "90d" = best in last 90 days (default — represents current capacity)
 *                  "all" = best ever (peak achievement, matches StrengthLevel methodology)
 */
export async function getStrengthDashboard(windowKey: "90d" | "all" = "90d") {
  const [profile, bw, benchmarks] = await Promise.all([
    getProfile(),
    getLatestBodyweight(),
    listBenchmarks(),
  ]);

  if (!profile.sex || !bw || benchmarks.length === 0) {
    return {
      profile,
      bodyweight: bw,
      benchmarks: [],
      windowKey,
      needsSetup: !profile.sex || !bw || benchmarks.length === 0,
      setupMissing: {
        sex: !profile.sex,
        bodyweight: !bw,
        benchmarks: benchmarks.length === 0,
      },
    };
  }

  // Fetch sets for all benchmark exercises in one query (paginated).
  // For 90d window, filter by date in the query.
  const exerciseIds = benchmarks.map((b) => b.exercise_id);
  let startStr: string | null = null;
  if (windowKey === "90d") {
    const start = new Date();
    start.setDate(start.getDate() - 90);
    startStr = start.toISOString().split("T")[0];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allSets = await fetchAllRows<any>((from, to) => {
    let q = supabase
      .from("sets")
      .select("exercise_id, side, reps, load, workouts!inner(performed_on)")
      .in("exercise_id", exerciseIds);
    if (startStr) q = q.gte("workouts.performed_on", startStr);
    return q.range(from, to);
  });

  // Compute best e1RM PER BENCHMARK (not per exercise), because for
  // ADD_BODYWEIGHT_LIFTS (pull-up/chin-up/dip) we must compute Epley on the
  // TOTAL weight being moved (BW + added), not on added weight only.
  const bwLbs = Number(bw.weight_lbs);
  const enriched = benchmarks.map((b) => {
    const addBw = ADD_BODYWEIGHT_LIFTS.includes(b.standard_lift);
    const exerciseSets = allSets.filter((s) => s.exercise_id === b.exercise_id);

    let best: {
      e1rm: number; // total e1RM (already includes bodyweight if applicable)
      reps: number;
      load: number; // original logged load (e.g., added weight for pull-ups)
      date: string;
    } | null = null;

    for (const s of exerciseSets) {
      const originalLoad = Number(s.load);
      const reps = Number(s.reps);
      if (reps <= 0) continue;
      // For bodyweight lifts: total weight = BW + added (added can be 0 or negative)
      const totalLoad = addBw ? originalLoad + bwLbs : originalLoad;
      if (totalLoad <= 0) continue;
      const e1rm = calculateE1RM(totalLoad, reps);
      if (!best || e1rm > best.e1rm) {
        best = {
          e1rm,
          reps,
          load: originalLoad,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          date: (s as any).workouts.performed_on as string,
        };
      }
    }

    if (!best) {
      return { ...b, best: null, tier: null };
    }

    const tier = computeTier(b.standard_lift, profile.sex!, best.e1rm, bwLbs);
    return {
      ...b,
      best,
      adjustedE1RM: best.e1rm,
      tier,
    };
  });

  return {
    profile,
    bodyweight: bw,
    benchmarks: enriched,
    windowKey,
    needsSetup: false,
    setupMissing: { sex: false, bodyweight: false, benchmarks: false },
  };
}
