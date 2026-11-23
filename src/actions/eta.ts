"use server";

import { supabase } from "@/db";
import { fetchAllRows } from "@/lib/paginate";
import { calculateE1RM } from "@/lib/e1rm";
import { ADD_BODYWEIGHT_LIFTS, computeTier, STANDARD_LIFT_LABELS, type Tier } from "@/lib/strength-standards";
import { getProfile, getLatestBodyweight, listBenchmarks } from "@/actions/strength";
import { listGoals } from "@/actions/goals";

export type ETARow = {
  exerciseId: string;
  exerciseName: string;
  standardLift: string;
  standardLiftLabel: string;
  currentE1RM: number;
  currentTier: Tier;
  nextTier: Tier | null;
  nextTierLbs: number | null;
  gapLbs: number | null;        // lbs to reach next tier (e1RM)
  slopeLbsPerWeek: number | null;
  etaDays: number | null;       // days at current slope
  etaDate: string | null;       // YYYY-MM-DD
  confidence: "low" | "medium" | "high";
  reason: string;               // explanation when ETA is null
};

export type GoalETARow = {
  exerciseId: string;
  exerciseName: string;
  targetE1RM: number;
  currentE1RM: number;
  gapLbs: number;            // lbs to reach target (0 if already met)
  pctToGoal: number;         // 0–100 progress toward target
  targetDate: string | null; // user's optional self-set deadline
  note: string | null;
  slopeLbsPerWeek: number | null;
  etaDays: number | null;
  etaDate: string | null;    // projected achievement date at current trend
  confidence: "low" | "medium" | "high";
  status: "achieved" | "on-track" | "behind" | "stalled" | "no-data";
  reason: string;
};

function linearSlope(points: { x: number; y: number }[]): number | null {
  if (points.length < 3) return null;
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

export async function getETAProjections(): Promise<{
  needsSetup: boolean;
  rows: ETARow[];
}> {
  const [profile, bw, benchmarks] = await Promise.all([
    getProfile(),
    getLatestBodyweight(),
    listBenchmarks(),
  ]);

  if (!profile.sex || !bw || benchmarks.length === 0) {
    return { needsSetup: true, rows: [] };
  }

  const bwLbs = Number(bw.weight_lbs);
  const exerciseIds = benchmarks.map((b) => b.exercise_id);

  // Pull benchmark sets in last 180 days (enough for trend)
  const start = new Date();
  start.setDate(start.getDate() - 180);
  const startStr = start.toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sets = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select("exercise_id, reps, load, workouts!inner(performed_on)")
      .in("exercise_id", exerciseIds)
      .gte("workouts.performed_on", startStr)
      .range(from, to),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result: ETARow[] = [];
  for (const b of benchmarks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = (b as any).exercise;
    if (!ex) continue;
    const addBw = ADD_BODYWEIGHT_LIFTS.includes(b.standard_lift);

    // Top e1RM per session
    const sessions = new Map<string, number>();
    for (const s of sets.filter((x) => x.exercise_id === b.exercise_id)) {
      const reps = Number(s.reps);
      const load = Number(s.load);
      if (reps <= 0) continue;
      const totalLoad = addBw ? load + bwLbs : load;
      if (totalLoad <= 0) continue;
      const e = calculateE1RM(totalLoad, reps);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (s as any).workouts.performed_on as string;
      const cur = sessions.get(d) ?? 0;
      if (e > cur) sessions.set(d, e);
    }

    const sortedSessions = Array.from(sessions.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const currentE1RM = sortedSessions.length ? Math.max(...sortedSessions.map(([, v]) => v)) : 0;

    const baseRow: ETARow = {
      exerciseId: b.exercise_id,
      exerciseName: ex.name,
      standardLift: b.standard_lift,
      standardLiftLabel: STANDARD_LIFT_LABELS[b.standard_lift as keyof typeof STANDARD_LIFT_LABELS] ?? b.standard_lift,
      currentE1RM: Math.round(currentE1RM),
      currentTier: "beginner",
      nextTier: null,
      nextTierLbs: null,
      gapLbs: null,
      slopeLbsPerWeek: null,
      etaDays: null,
      etaDate: null,
      confidence: "low",
      reason: "",
    };

    if (currentE1RM <= 0) {
      result.push({ ...baseRow, reason: "No data logged yet." });
      continue;
    }

    const tierInfo = computeTier(b.standard_lift, profile.sex, currentE1RM, bwLbs);
    baseRow.currentTier = tierInfo.tier;
    baseRow.nextTier = tierInfo.nextTier;
    baseRow.nextTierLbs = tierInfo.thresholdToNext != null ? Math.round(tierInfo.thresholdToNext) : null;
    baseRow.gapLbs = baseRow.nextTierLbs != null ? Math.max(0, baseRow.nextTierLbs - baseRow.currentE1RM) : null;

    if (!baseRow.nextTier || baseRow.nextTierLbs == null) {
      result.push({ ...baseRow, reason: "Already at Elite tier — no next target." });
      continue;
    }

    // Slope from last 8 sessions (or all if fewer)
    if (sortedSessions.length < 3) {
      result.push({ ...baseRow, reason: "Need ≥3 sessions to compute a trend." });
      continue;
    }
    const tail = sortedSessions.slice(-8);
    const x0 = new Date(tail[0][0] + "T12:00:00").getTime();
    const points = tail.map(([d, y]) => ({
      x: (new Date(d + "T12:00:00").getTime() - x0) / (1000 * 60 * 60 * 24),
      y,
    }));
    const slopePerDay = linearSlope(points);
    if (slopePerDay == null) {
      result.push({ ...baseRow, reason: "Trend slope undefined." });
      continue;
    }
    const slopePerWeek = slopePerDay * 7;
    baseRow.slopeLbsPerWeek = Math.round(slopePerWeek * 10) / 10;

    if (slopePerWeek <= 0.1) {
      result.push({ ...baseRow, reason: "Flat or negative trend — can't project. Break the plateau first." });
      continue;
    }

    const etaDays = baseRow.gapLbs! / slopePerDay;
    if (!isFinite(etaDays) || etaDays > 365 * 3) {
      result.push({ ...baseRow, reason: "ETA too far out to predict reliably (>3 years)." });
      continue;
    }
    const etaDate = new Date(today);
    etaDate.setDate(etaDate.getDate() + Math.ceil(etaDays));

    // Confidence based on sample size + slope magnitude
    let conf: "low" | "medium" | "high" = "low";
    if (tail.length >= 6 && slopePerWeek > 0.5) conf = "high";
    else if (tail.length >= 5 && slopePerWeek > 0.2) conf = "medium";

    baseRow.etaDays = Math.ceil(etaDays);
    baseRow.etaDate = etaDate.toISOString().split("T")[0];
    baseRow.confidence = conf;
    result.push(baseRow);
  }

  // Sort: rows with ETAs first (closest first), then no-ETA rows
  result.sort((a, b) => {
    if (a.etaDays != null && b.etaDays != null) return a.etaDays - b.etaDays;
    if (a.etaDays != null) return -1;
    if (b.etaDays != null) return 1;
    return a.exerciseName.localeCompare(b.exerciseName);
  });

  return { needsSetup: false, rows: result };
}

/**
 * Project ETA toward each user-set per-exercise goal (any exercise, not just
 * benchmark lifts). Same linear-regression trend as tier projections, but the
 * target is the user's own number.
 */
export async function getGoalProjections(): Promise<GoalETARow[]> {
  const goals = await listGoals();
  if (goals.length === 0) return [];

  const exerciseIds = goals.map((g) => g.exercise_id);

  const start = new Date();
  start.setDate(start.getDate() - 180);
  const startStr = start.toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sets = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select("exercise_id, reps, load, workouts!inner(performed_on)")
      .in("exercise_id", exerciseIds)
      .gte("workouts.performed_on", startStr)
      .range(from, to),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows: GoalETARow[] = [];
  for (const g of goals) {
    const target = Number(g.target_e1rm);

    // Top e1RM per session for this exercise
    const sessions = new Map<string, number>();
    for (const s of sets.filter((x) => x.exercise_id === g.exercise_id)) {
      const reps = Number(s.reps);
      const load = Number(s.load);
      if (reps <= 0 || load <= 0) continue;
      const e = calculateE1RM(load, reps);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (s as any).workouts.performed_on as string;
      const cur = sessions.get(d) ?? 0;
      if (e > cur) sessions.set(d, e);
    }

    const sorted = Array.from(sessions.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const currentE1RM = sorted.length ? Math.round(Math.max(...sorted.map(([, v]) => v))) : 0;
    const gapLbs = Math.max(0, Math.round(target - currentE1RM));
    const pctToGoal = target > 0 ? Math.min(100, Math.round((currentE1RM / target) * 100)) : 0;

    const base: GoalETARow = {
      exerciseId: g.exercise_id,
      exerciseName: g.exercise.name,
      targetE1RM: Math.round(target),
      currentE1RM,
      gapLbs,
      pctToGoal,
      targetDate: g.target_date,
      note: g.note,
      slopeLbsPerWeek: null,
      etaDays: null,
      etaDate: null,
      confidence: "low",
      status: "no-data",
      reason: "",
    };

    // Already achieved (logged best meets/exceeds target)
    if (currentE1RM >= target) {
      rows.push({ ...base, status: "achieved", pctToGoal: 100, gapLbs: 0, reason: "Target reached 🎉" });
      continue;
    }

    if (currentE1RM <= 0) {
      rows.push({ ...base, reason: "No data logged yet for this lift." });
      continue;
    }

    if (sorted.length < 3) {
      rows.push({ ...base, status: "stalled", reason: "Need ≥3 sessions to project a trend." });
      continue;
    }

    const tail = sorted.slice(-8);
    const x0 = new Date(tail[0][0] + "T12:00:00").getTime();
    const points = tail.map(([d, y]) => ({
      x: (new Date(d + "T12:00:00").getTime() - x0) / (1000 * 60 * 60 * 24),
      y,
    }));
    const slopePerDay = linearSlope(points);
    if (slopePerDay == null) {
      rows.push({ ...base, status: "stalled", reason: "Trend slope undefined." });
      continue;
    }
    const slopePerWeek = Math.round(slopePerDay * 7 * 10) / 10;
    base.slopeLbsPerWeek = slopePerWeek;

    if (slopePerWeek <= 0.1) {
      rows.push({ ...base, status: "stalled", reason: "Flat or negative trend — break the plateau first." });
      continue;
    }

    const etaDays = gapLbs / slopePerDay;
    if (!isFinite(etaDays) || etaDays > 365 * 3) {
      rows.push({ ...base, status: "behind", reason: "ETA too far out to predict (>3 years)." });
      continue;
    }
    const etaDate = new Date(today);
    etaDate.setDate(etaDate.getDate() + Math.ceil(etaDays));
    const etaDateStr = etaDate.toISOString().split("T")[0];

    let conf: "low" | "medium" | "high" = "low";
    if (tail.length >= 6 && slopePerWeek > 0.5) conf = "high";
    else if (tail.length >= 5 && slopePerWeek > 0.2) conf = "medium";

    // On-track vs behind: compare projected date to the user's target date
    let status: GoalETARow["status"] = "on-track";
    if (g.target_date && etaDateStr > g.target_date) status = "behind";

    rows.push({
      ...base,
      etaDays: Math.ceil(etaDays),
      etaDate: etaDateStr,
      confidence: conf,
      status,
      reason: "",
    });
  }

  // Sort: achieved last, then by closest ETA, then by % progress
  const statusRank: Record<GoalETARow["status"], number> = {
    "on-track": 0, behind: 1, stalled: 2, "no-data": 3, achieved: 4,
  };
  rows.sort((a, b) => {
    if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status];
    if (a.etaDays != null && b.etaDays != null) return a.etaDays - b.etaDays;
    return b.pctToGoal - a.pctToGoal;
  });

  return rows;
}
