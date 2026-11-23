"use server";

import { supabase } from "@/db";
import { fetchAllRows } from "@/lib/paginate";
import { calculateE1RM } from "@/lib/e1rm";

export type SetPoint = {
  date: string;     // YYYY-MM-DD
  side: string;     // "both" | "left" | "right"
  reps: number;
  load: number;
  e1rm: number;
  daysAgo: number;  // epoch-day delta for scatter X axis
};

export type RepMax = {
  reps: number;
  load: number;
  e1rm: number;
  date: string;
} | null;

export type RepScheme = {
  // e.g. "5×5 @ 165" — best load achieved with at least 5 sets of 5 in a single session
  scheme: string;   // "1RM" | "3RM" | "5RM" | "5x5" | "3x5"
  load: number;
  date: string;
} | null;

export type DeepDiveData = {
  sets: SetPoint[];
  // Per-side bests so unilateral works. For bilateral only `both` is populated.
  best: {
    both: { rm1: RepMax; rm3: RepMax; rm5: RepMax; scheme5x5: RepScheme; scheme3x5: RepScheme };
    left: { rm1: RepMax; rm3: RepMax; rm5: RepMax; scheme5x5: RepScheme; scheme3x5: RepScheme };
    right: { rm1: RepMax; rm3: RepMax; rm5: RepMax; scheme5x5: RepScheme; scheme3x5: RepScheme };
  };
  // Trend: e1RM slope on best-set-per-session over the last 8 sessions.
  trend: {
    side: "both" | "left" | "right";
    sessions: number;
    slopeLbsPerWeek: number;  // positive = improving
    latestE1RM: number;
    earliestE1RM: number;
  } | null;
  // Plateau: top-set load that hasn't increased in N weeks
  plateau: {
    side: "both" | "left" | "right";
    weeksFlat: number;
    currentTopLoad: number;
  } | null;
};

function daysAgo(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00").getTime();
  const now = Date.now();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

function bestRMForReps(sets: SetPoint[], reps: number): RepMax {
  let best: RepMax = null;
  for (const s of sets) {
    if (s.reps !== reps) continue;
    if (!best || s.load > best.load) {
      best = { reps: s.reps, load: s.load, e1rm: s.e1rm, date: s.date };
    }
  }
  return best;
}

/**
 * Best NxM scheme: highest load where ≥ N sets in a single session each hit ≥ M reps.
 * (e.g. 5x5 = at least 5 sets of ≥5 reps in one session at the same load — uses min load of the qualifying sets)
 */
function bestScheme(sets: SetPoint[], targetSets: number, targetReps: number): RepScheme {
  // Group by date
  const byDate = new Map<string, SetPoint[]>();
  for (const s of sets) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }
  let best: RepScheme = null;
  for (const [date, daySets] of byDate) {
    // Only sets meeting rep requirement
    const eligible = daySets.filter((s) => s.reps >= targetReps);
    if (eligible.length < targetSets) continue;
    // Group by load — find any load that appears ≥ targetSets times
    const byLoad = new Map<number, number>();
    for (const s of eligible) {
      byLoad.set(s.load, (byLoad.get(s.load) ?? 0) + 1);
    }
    for (const [load, count] of byLoad) {
      if (count >= targetSets) {
        if (!best || load > best.load) {
          best = { scheme: `${targetSets}×${targetReps}`, load, date };
        }
      }
    }
  }
  return best;
}

function computeTrend(setsForSide: SetPoint[]): DeepDiveData["trend"] {
  // Best e1RM per session, chronological order
  const byDate = new Map<string, number>();
  for (const s of setsForSide) {
    byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, s.e1rm));
  }
  const sessions = Array.from(byDate.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (sessions.length < 3) return null;

  // Take last 8 sessions
  const recent = sessions.slice(-8);
  if (recent.length < 3) return null;

  // Linear regression: x = days since first session, y = e1RM
  const x0 = new Date(recent[0][0] + "T12:00:00").getTime();
  const points = recent.map(([d, y]) => ({
    x: (new Date(d + "T12:00:00").getTime() - x0) / (1000 * 60 * 60 * 24), // days
    y,
  }));

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slopePerDay = (n * sumXY - sumX * sumY) / denom;
  const slopePerWeek = slopePerDay * 7;

  return {
    side: setsForSide[0]?.side as "both" | "left" | "right",
    sessions: recent.length,
    slopeLbsPerWeek: Math.round(slopePerWeek * 10) / 10,
    latestE1RM: Math.round(recent[recent.length - 1][1]),
    earliestE1RM: Math.round(recent[0][1]),
  };
}

function computePlateau(setsForSide: SetPoint[]): DeepDiveData["plateau"] {
  if (setsForSide.length === 0) return null;
  // Top *load* per session, chronological
  const byDate = new Map<string, number>();
  for (const s of setsForSide) {
    byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, s.load));
  }
  const sessions = Array.from(byDate.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (sessions.length < 3) return null;

  // Find current top load and the most-recent date it (or higher) was hit.
  let allTimeTop = 0;
  let allTimeTopDate = "";
  for (const [d, load] of sessions) {
    if (load >= allTimeTop) { allTimeTop = load; allTimeTopDate = d; }
  }

  const last = sessions[sessions.length - 1];
  // Plateau only meaningful if recent training hasn't beaten the all-time top.
  // We measure weeks between all-time-top date and last session.
  const weeksFlat = Math.floor(
    (new Date(last[0] + "T12:00:00").getTime() - new Date(allTimeTopDate + "T12:00:00").getTime())
      / (1000 * 60 * 60 * 24 * 7)
  );
  if (weeksFlat < 4) return null; // less than 4 weeks isn't a plateau

  return {
    side: setsForSide[0]?.side as "both" | "left" | "right",
    weeksFlat,
    currentTopLoad: allTimeTop,
  };
}

export async function getDeepDive(exerciseId: string, isUnilateral: boolean): Promise<DeepDiveData> {
  // Pull every set ever logged for this exercise
  const allRows = await fetchAllRows<{ side: string; reps: number; load: number | string; workouts: { performed_on: string } | null }>(
    (from, to) =>
      supabase
        .from("sets")
        .select("side, reps, load, workouts!inner(performed_on)")
        .eq("exercise_id", exerciseId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .range(from, to) as any,
  );

  // Build flat SetPoint list
  const sets: SetPoint[] = [];
  for (const r of allRows) {
    const reps = Number(r.reps);
    const load = Number(r.load);
    if (reps <= 0 || load <= 0) continue;
    const date = r.workouts?.performed_on;
    if (!date) continue;
    sets.push({
      date,
      side: r.side,
      reps,
      load,
      e1rm: calculateE1RM(load, reps),
      daysAgo: daysAgo(date),
    });
  }

  // Slice per side
  const both = sets.filter((s) => s.side === "both");
  const left = sets.filter((s) => s.side === "left");
  const right = sets.filter((s) => s.side === "right");

  function buildBests(sub: SetPoint[]) {
    return {
      rm1: bestRMForReps(sub, 1),
      rm3: bestRMForReps(sub, 3),
      rm5: bestRMForReps(sub, 5),
      scheme5x5: bestScheme(sub, 5, 5),
      scheme3x5: bestScheme(sub, 3, 5),
    };
  }

  // Pick the side with more data for trend + plateau (unilateral: prefer dominant side; default to "both" for bilateral)
  let trendSide: SetPoint[] = both;
  let plateauSide: SetPoint[] = both;
  if (isUnilateral) {
    trendSide = right.length >= left.length ? right : left;
    plateauSide = trendSide;
  }

  return {
    sets,
    best: {
      both: buildBests(both),
      left: buildBests(left),
      right: buildBests(right),
    },
    trend: computeTrend(trendSide),
    plateau: computePlateau(plateauSide),
  };
}
