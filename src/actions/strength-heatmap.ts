"use server";

import { supabase } from "@/db";
import { fetchAllRows } from "@/lib/paginate";
import { ADD_BODYWEIGHT_LIFTS, computeTier, type Tier, type StandardLift } from "@/lib/strength-standards";
import { calculateE1RM } from "@/lib/e1rm";
import { getProfile, getLatestBodyweight, listBenchmarks } from "@/actions/strength";
import { windowStartDate, type WindowKey } from "@/lib/windows";

export type StrengthByMuscle = {
  bodyPart: string;
  tier: Tier;
  tierLevel: number; // 1..5 for color mapping
  bestE1RM: number;
  exerciseName: string;
  standardLift: StandardLift;
};

export type StrengthHeatmap = {
  needsSetup: boolean;
  setupMissing: { sex: boolean; bodyweight: boolean; benchmarks: boolean };
  byMuscle: Record<string, StrengthByMuscle>;
  benchmarkCount: number;
  windowKey: WindowKey;
};

const TIER_LEVEL: Record<Tier, number> = {
  beginner: 1,
  novice: 2,
  intermediate: 3,
  advanced: 4,
  elite: 5,
};

/**
 * Per-body_part strength tier, derived from benchmark lifts.
 * Each body part takes the BEST tier among its benchmarks (some body parts
 * — e.g. back — may have multiple benchmarks like pull-up + chest-supported row).
 *
 * Window defaults to "90d" = current capacity. "all" = all-time peak,
 * which is stale during rehab. Shorter windows (7d/30d) may show partial
 * data if you haven't trained that benchmark recently.
 */
export async function getStrengthHeatmap(
  windowKey: WindowKey = "90d"
): Promise<StrengthHeatmap> {
  const [profile, bw, benchmarks] = await Promise.all([
    getProfile(),
    getLatestBodyweight(),
    listBenchmarks(),
  ]);

  if (!profile.sex || !bw || benchmarks.length === 0) {
    return {
      needsSetup: true,
      setupMissing: {
        sex: !profile.sex,
        bodyweight: !bw,
        benchmarks: benchmarks.length === 0,
      },
      byMuscle: {},
      benchmarkCount: 0,
      windowKey,
    };
  }

  const bwLbs = Number(bw.weight_lbs);
  const exerciseIds = benchmarks.map((b) => b.exercise_id);

  const startStr = windowStartDate(windowKey);

  // Fetch sets for benchmark exercises
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allSets = await fetchAllRows<any>((from, to) => {
    let q = supabase
      .from("sets")
      .select("exercise_id, reps, load, workouts!inner(performed_on)")
      .in("exercise_id", exerciseIds);
    if (startStr) q = q.gte("workouts.performed_on", startStr);
    return q.range(from, to);
  });

  // Compute best e1RM + tier per benchmark
  const byMuscle: Record<string, StrengthByMuscle> = {};
  for (const b of benchmarks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = (b as any).exercise;
    if (!ex?.body_part) continue;
    const bp = ex.body_part as string;
    const addBw = ADD_BODYWEIGHT_LIFTS.includes(b.standard_lift);
    const sets = allSets.filter((s) => s.exercise_id === b.exercise_id);

    let bestE = 0;
    for (const s of sets) {
      const reps = Number(s.reps);
      const load = Number(s.load);
      if (reps <= 0) continue;
      const totalLoad = addBw ? load + bwLbs : load;
      if (totalLoad <= 0) continue;
      const e = calculateE1RM(totalLoad, reps);
      if (e > bestE) bestE = e;
    }
    if (bestE <= 0) continue;

    const { tier } = computeTier(b.standard_lift, profile.sex, bestE, bwLbs);
    const level = TIER_LEVEL[tier];

    const existing = byMuscle[bp];
    // Keep the best (highest) tier per body part
    if (!existing || level > existing.tierLevel) {
      byMuscle[bp] = {
        bodyPart: bp,
        tier,
        tierLevel: level,
        bestE1RM: Math.round(bestE),
        exerciseName: ex.name as string,
        standardLift: b.standard_lift,
      };
    }
  }

  return {
    needsSetup: false,
    setupMissing: { sex: false, bodyweight: false, benchmarks: false },
    byMuscle,
    benchmarkCount: benchmarks.length,
    windowKey,
  };
}
