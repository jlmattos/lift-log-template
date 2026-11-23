"use server";

import { supabase } from "@/db";
import { fetchAllRows } from "@/lib/paginate";
import { calculateE1RM } from "@/lib/e1rm";

export type PlateauStatus = "fresh" | "stalled" | "plateau" | "stuck" | "regressing";

export type PlateauRow = {
  exerciseId: string;
  exerciseName: string;
  bodyPart: string | null;
  isUnilateral: boolean;
  // Best load in the most recent session window we evaluated
  currentTopLoad: number;
  // The all-time top load (single rep × load doesn't matter, this is just max load)
  peakTopLoad: number;
  peakDate: string;
  daysSincePeak: number;
  weeksSincePeak: number;
  sessionsSincePeak: number;
  // Trend: lbs/week slope on top e1RM over the last 8 sessions
  slopeLbsPerWeek: number | null;
  status: PlateauStatus;
  recommendation: string;
};

function classify(weeksSincePeak: number, slope: number | null): PlateauStatus {
  if (weeksSincePeak < 3) return "fresh";
  if (slope != null && slope < -0.3) return "regressing";
  if (weeksSincePeak < 6) return "stalled";
  if (weeksSincePeak < 12) return "plateau";
  return "stuck";
}

function recommend(status: PlateauStatus, weeks: number): string {
  switch (status) {
    case "fresh":
      return "Recently progressed — keep loading.";
    case "stalled":
      return `Top load flat ${weeks}w. Try changing rep range (e.g., 5×5 instead of 8s) or adding a back-off set.`;
    case "plateau":
      return `${weeks}w plateau — schedule a deload week (drop ~15%, then rebuild), then push.`;
    case "stuck":
      return `${weeks}w stuck. Swap to a variant (e.g., RDL→good morning, Zercher→front squat) for 4-6 weeks.`;
    case "regressing":
      return "Top e1RM trending down — reduce frequency/volume; recovery is likely the limit.";
  }
}

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

export async function getPlateauReport(): Promise<{
  rows: PlateauRow[];
  totalExercisesEvaluated: number;
}> {
  // Pull all sets ever joined with exercise + workout
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select("exercise_id, reps, load, workouts!inner(performed_on), exercises!inner(id, name, is_unilateral, body_part)")
      .range(from, to),
  );

  // Group by exercise, then by session-date
  type Session = { date: string; topLoad: number; topE1RM: number };
  const byExercise = new Map<string, { name: string; bodyPart: string | null; isUnilateral: boolean; sessions: Map<string, Session> }>();
  for (const r of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = (r as any).exercises;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (r as any).workouts.performed_on as string;
    const reps = Number(r.reps);
    const load = Number(r.load);
    if (reps <= 0 || load <= 0) continue;
    const e1 = calculateE1RM(load, reps);
    let entry = byExercise.get(ex.id);
    if (!entry) {
      entry = { name: ex.name, bodyPart: ex.body_part ?? null, isUnilateral: !!ex.is_unilateral, sessions: new Map() };
      byExercise.set(ex.id, entry);
    }
    const s = entry.sessions.get(d) ?? { date: d, topLoad: 0, topE1RM: 0 };
    if (load > s.topLoad) s.topLoad = load;
    if (e1 > s.topE1RM) s.topE1RM = e1;
    entry.sessions.set(d, s);
  }

  const result: PlateauRow[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();
  const ninetyDaysAgo = todayTs - 90 * 24 * 60 * 60 * 1000;

  for (const [exId, ex] of byExercise) {
    const sessions = Array.from(ex.sessions.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (sessions.length < 6) continue;

    // Require at least 3 sessions in the last 90 days to be "actively trained"
    const recent = sessions.filter((s) => new Date(s.date + "T12:00:00").getTime() >= ninetyDaysAgo);
    if (recent.length < 3) continue;

    // Peak top load + when it was last achieved (most recent date hitting that peak)
    let peakLoad = 0;
    let peakDate = sessions[0].date;
    for (const s of sessions) {
      if (s.topLoad >= peakLoad) { peakLoad = s.topLoad; peakDate = s.date; }
    }

    const last = sessions[sessions.length - 1];
    const peakTs = new Date(peakDate + "T12:00:00").getTime();
    const lastTs = new Date(last.date + "T12:00:00").getTime();
    const daysSincePeak = Math.floor((lastTs - peakTs) / (1000 * 60 * 60 * 24));
    const weeksSincePeak = Math.floor(daysSincePeak / 7);
    const sessionsSincePeak = sessions.filter((s) => s.date > peakDate).length;

    // Slope on last 8 sessions' top e1RM
    const tail = sessions.slice(-8);
    const x0 = new Date(tail[0].date + "T12:00:00").getTime();
    const slopePerDay = linearSlope(
      tail.map((s) => ({
        x: (new Date(s.date + "T12:00:00").getTime() - x0) / (1000 * 60 * 60 * 24),
        y: s.topE1RM,
      }))
    );
    const slopePerWeek = slopePerDay != null ? Math.round(slopePerDay * 7 * 10) / 10 : null;

    const status = classify(weeksSincePeak, slopePerWeek);
    result.push({
      exerciseId: exId,
      exerciseName: ex.name,
      bodyPart: ex.bodyPart,
      isUnilateral: ex.isUnilateral,
      currentTopLoad: last.topLoad,
      peakTopLoad: peakLoad,
      peakDate,
      daysSincePeak,
      weeksSincePeak,
      sessionsSincePeak,
      slopeLbsPerWeek: slopePerWeek,
      status,
      recommendation: recommend(status, weeksSincePeak),
    });
  }

  // Sort: most stuck first, then by weeks plateau desc
  const order: Record<PlateauStatus, number> = {
    "regressing": 0,
    "stuck": 1,
    "plateau": 2,
    "stalled": 3,
    "fresh": 4,
  };
  result.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return b.weeksSincePeak - a.weeksSincePeak;
  });

  return { rows: result, totalExercisesEvaluated: byExercise.size };
}
