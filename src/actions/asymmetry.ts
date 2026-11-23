"use server";

import { supabase } from "@/db";
import { fetchAllRows } from "@/lib/paginate";
import { calculateE1RM } from "@/lib/e1rm";

export type AsymmetryRow = {
  exerciseId: string;
  exerciseName: string;
  bodyPart: string | null;
  leftE1RM: number;
  rightE1RM: number;
  leftSets: number;
  rightSets: number;
  // Gap = |L - R| / avg(L, R)  (as a percentage)
  gapPct: number;
  // "left" if right is stronger (i.e. left lags), "right" if left is stronger
  weakerSide: "left" | "right" | null;
  tier: "none" | "low" | "medium" | "high"; // <5%, 5-10%, 10-15%, >15%
  // Trend: gap % delta vs the *previous* window of same length (negative = closing)
  prevGapPct: number | null;
  gapDelta: number | null;
};

function tierFor(pct: number): AsymmetryRow["tier"] {
  if (pct < 5) return "none";
  if (pct < 10) return "low";
  if (pct < 15) return "medium";
  return "high";
}

type Row = {
  exercise_id: string;
  side: string;
  reps: number;
  load: number | string;
  exercises: { id: string; name: string; body_part: string | null; is_unilateral: boolean } | null;
};

async function fetchSetsInWindow(startStr: string, endStr?: string): Promise<Row[]> {
  return fetchAllRows<Row>((from, to) => {
    let q = supabase
      .from("sets")
      .select("exercise_id, side, reps, load, exercises!inner(id, name, body_part, is_unilateral), workouts!inner(performed_on)")
      .eq("exercises.is_unilateral", true)
      .gte("workouts.performed_on", startStr);
    if (endStr) q = q.lt("workouts.performed_on", endStr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return q.range(from, to) as any;
  });
}

function aggregate(rows: Row[]): Map<string, { name: string; bodyPart: string | null; leftBest: number; rightBest: number; leftSets: number; rightSets: number }> {
  const map = new Map<string, { name: string; bodyPart: string | null; leftBest: number; rightBest: number; leftSets: number; rightSets: number }>();
  for (const r of rows) {
    const ex = r.exercises;
    if (!ex) continue;
    const reps = Number(r.reps);
    const load = Number(r.load);
    const e = calculateE1RM(load, reps);
    if (e <= 0) continue;
    let entry = map.get(ex.id);
    if (!entry) {
      entry = { name: ex.name, bodyPart: ex.body_part, leftBest: 0, rightBest: 0, leftSets: 0, rightSets: 0 };
      map.set(ex.id, entry);
    }
    if (r.side === "left") {
      entry.leftSets += 1;
      if (e > entry.leftBest) entry.leftBest = e;
    } else if (r.side === "right") {
      entry.rightSets += 1;
      if (e > entry.rightBest) entry.rightBest = e;
    }
  }
  return map;
}

/**
 * Asymmetry leaderboard across all unilateral exercises in a window.
 * Compares best e1RM per side. Also computes prev-window gap for a trend signal.
 */
export async function getAsymmetryLeaderboard(daysBack: number = 90): Promise<{
  windowDays: number;
  rows: AsymmetryRow[];
}> {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - daysBack);
  const startStr = start.toISOString().split("T")[0];

  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - daysBack);
  const prevStartStr = prevStart.toISOString().split("T")[0];

  const [currentRows, prevRows] = await Promise.all([
    fetchSetsInWindow(startStr),
    fetchSetsInWindow(prevStartStr, startStr),
  ]);

  const current = aggregate(currentRows);
  const prev = aggregate(prevRows);

  const out: AsymmetryRow[] = [];
  for (const [exId, agg] of current) {
    // Need both sides to have data
    if (agg.leftBest <= 0 || agg.rightBest <= 0) continue;
    const avg = (agg.leftBest + agg.rightBest) / 2;
    const gapPct = (Math.abs(agg.leftBest - agg.rightBest) / avg) * 100;
    const weakerSide: "left" | "right" | null =
      agg.leftBest === agg.rightBest
        ? null
        : agg.leftBest < agg.rightBest
          ? "left"
          : "right";

    const prevAgg = prev.get(exId);
    let prevGapPct: number | null = null;
    let gapDelta: number | null = null;
    if (prevAgg && prevAgg.leftBest > 0 && prevAgg.rightBest > 0) {
      const prevAvg = (prevAgg.leftBest + prevAgg.rightBest) / 2;
      prevGapPct = (Math.abs(prevAgg.leftBest - prevAgg.rightBest) / prevAvg) * 100;
      gapDelta = gapPct - prevGapPct;
    }

    out.push({
      exerciseId: exId,
      exerciseName: agg.name,
      bodyPart: agg.bodyPart,
      leftE1RM: Math.round(agg.leftBest),
      rightE1RM: Math.round(agg.rightBest),
      leftSets: agg.leftSets,
      rightSets: agg.rightSets,
      gapPct: Math.round(gapPct * 10) / 10,
      weakerSide,
      tier: tierFor(gapPct),
      prevGapPct: prevGapPct != null ? Math.round(prevGapPct * 10) / 10 : null,
      gapDelta: gapDelta != null ? Math.round(gapDelta * 10) / 10 : null,
    });
  }

  // Sort by gap % desc (biggest imbalances first)
  out.sort((a, b) => b.gapPct - a.gapPct);

  return { windowDays: daysBack, rows: out };
}
