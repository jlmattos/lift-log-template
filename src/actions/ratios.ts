"use server";

import { supabase } from "@/db";
import { fetchAllRows } from "@/lib/paginate";
import { calculateE1RM } from "@/lib/e1rm";
import { ADD_BODYWEIGHT_LIFTS, type StandardLift } from "@/lib/strength-standards";
import { RATIO_DEFS, type RatioDef } from "@/lib/ratio-defs";
import { getProfile, getLatestBodyweight, listBenchmarks } from "@/actions/strength";
import { windowStartDate, type WindowKey } from "@/lib/windows";

export type RatioResult = {
  def: RatioDef;
  // null = missing one or both inputs
  ratio: number | null;
  numeratorE1RM: number | null;
  denominatorE1RM: number | null;
  numeratorName: string | null;
  denominatorName: string | null;
  status: "missing" | "low" | "ok" | "high";
  deltaFromTarget: number | null; // percent away from nearest target edge
};

export type RatioReport = {
  needsSetup: boolean;
  results: RatioResult[];
  windowKey: WindowKey;
};

function classifyStatus(ratio: number | null, min: number, max: number): RatioResult["status"] {
  if (ratio == null) return "missing";
  if (ratio < min) return "low";
  if (ratio > max) return "high";
  return "ok";
}

function deltaPctFromBand(ratio: number, min: number, max: number): number {
  if (ratio < min) return Math.round(((min - ratio) / min) * 100);
  if (ratio > max) return Math.round(((ratio - max) / max) * 100);
  return 0;
}

export async function getLiftRatios(windowKey: WindowKey = "90d"): Promise<RatioReport> {
  const [profile, bw, benchmarks] = await Promise.all([
    getProfile(),
    getLatestBodyweight(),
    listBenchmarks(),
  ]);

  if (!profile.sex || !bw || benchmarks.length === 0) {
    return { needsSetup: true, results: [], windowKey };
  }

  const bwLbs = Number(bw.weight_lbs);
  const exerciseIds = benchmarks.map((b) => b.exercise_id);
  const startStr = windowStartDate(windowKey);

  // Pull benchmark sets (optionally windowed)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allSets = await fetchAllRows<any>((from, to) => {
    let q = supabase
      .from("sets")
      .select("exercise_id, reps, load, workouts!inner(performed_on)")
      .in("exercise_id", exerciseIds);
    if (startStr) q = q.gte("workouts.performed_on", startStr);
    return q.range(from, to);
  });

  // Best e1RM per benchmark (matching strength-dashboard math)
  const bestByLift = new Map<StandardLift, { e1rm: number; exerciseName: string }>();
  for (const b of benchmarks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = (b as any).exercise;
    const addBw = ADD_BODYWEIGHT_LIFTS.includes(b.standard_lift);
    let best = 0;
    for (const s of allSets.filter((x) => x.exercise_id === b.exercise_id)) {
      const reps = Number(s.reps);
      const load = Number(s.load);
      if (reps <= 0) continue;
      const totalLoad = addBw ? load + bwLbs : load;
      if (totalLoad <= 0) continue;
      const e = calculateE1RM(totalLoad, reps);
      if (e > best) best = e;
    }
    if (best > 0) {
      const prev = bestByLift.get(b.standard_lift);
      if (!prev || best > prev.e1rm) {
        bestByLift.set(b.standard_lift, { e1rm: best, exerciseName: ex?.name ?? b.standard_lift });
      }
    }
  }

  const pickFirstAvailable = (lifts: StandardLift[]): { e1rm: number; name: string } | null => {
    for (const l of lifts) {
      const entry = bestByLift.get(l);
      if (entry) return { e1rm: entry.e1rm, name: entry.exerciseName };
    }
    return null;
  };

  const results: RatioResult[] = RATIO_DEFS.map((def) => {
    const num = pickFirstAvailable(def.numerator);
    const den = pickFirstAvailable(def.denominator);
    if (!num || !den || den.e1rm === 0) {
      return {
        def,
        ratio: null,
        numeratorE1RM: num?.e1rm ?? null,
        denominatorE1RM: den?.e1rm ?? null,
        numeratorName: num?.name ?? null,
        denominatorName: den?.name ?? null,
        status: "missing",
        deltaFromTarget: null,
      };
    }
    const r = num.e1rm / den.e1rm;
    const status = classifyStatus(r, def.targetMin, def.targetMax);
    return {
      def,
      ratio: Math.round(r * 1000) / 1000,
      numeratorE1RM: Math.round(num.e1rm),
      denominatorE1RM: Math.round(den.e1rm),
      numeratorName: num.name,
      denominatorName: den.name,
      status,
      deltaFromTarget: deltaPctFromBand(r, def.targetMin, def.targetMax),
    };
  });

  return { needsSetup: false, results, windowKey };
}
