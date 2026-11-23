"use server";

import { supabase } from "@/db";
import { todayLocal } from "@/lib/dates";
import { fetchAllRows } from "@/lib/paginate";
import { calculateE1RM } from "@/lib/e1rm";
import { bodyPartLabel } from "@/lib/body-parts";
import { getStreakReport } from "@/actions/streak";
import { getAllPRs } from "@/actions/pr-timeline";

export type PeriodKey = "year" | "ytd" | "lastYear" | "all";

export type RecapData = {
  period: PeriodKey;
  label: string;
  windowStart: string;
  windowEnd: string;
  totalWorkouts: number;
  totalSets: number;
  totalVolume: number;
  totalReps: number;
  heaviestLift: { exerciseName: string; load: number; reps: number; date: string } | null;
  mostTrainedBodyPart: { bodyPart: string; bodyPartLabel: string; volume: number; sets: number } | null;
  mostImproved: {
    exerciseId: string;
    exerciseName: string;
    startE1RM: number;
    endE1RM: number;
    pctGain: number;
  } | null;
  prCount: number;
  currentStreakWeeks: number;
  longestStreakWeeks: number;
  // YoY deltas (vs prior equivalent period)
  yoy: {
    workoutsDeltaPct: number | null;
    volumeDeltaPct: number | null;
    prsDeltaPct: number | null;
  } | null;
  topExercisesByVolume: { exerciseName: string; volume: number; sets: number }[];
};

function dateRangeFor(period: PeriodKey): { start: string; end: string; label: string } {
  const today = new Date(todayLocal() + "T00:00:00");
  const yyyy = today.getFullYear();
  if (period === "ytd") {
    return {
      start: `${yyyy}-01-01`,
      end: today.toISOString().split("T")[0],
      label: `${yyyy} YTD`,
    };
  }
  if (period === "year") {
    const start = new Date(today);
    start.setFullYear(start.getFullYear() - 1);
    return {
      start: start.toISOString().split("T")[0],
      end: today.toISOString().split("T")[0],
      label: "Last 365 days",
    };
  }
  if (period === "lastYear") {
    const prev = yyyy - 1;
    return {
      start: `${prev}-01-01`,
      end: `${prev}-12-31`,
      label: `${prev}`,
    };
  }
  // all-time
  return { start: "2000-01-01", end: today.toISOString().split("T")[0], label: "All time" };
}

export async function getRecap(period: PeriodKey = "year"): Promise<RecapData> {
  const { start, end, label } = dateRangeFor(period);

  // Fetch all sets in window
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select("reps, load, workouts!inner(id, performed_on), exercises!inner(id, name, body_part)")
      .gte("workouts.performed_on", start)
      .lte("workouts.performed_on", end)
      .range(from, to),
  );

  const workoutIds = new Set<string>();
  let totalVolume = 0;
  let totalReps = 0;
  let heaviest: RecapData["heaviestLift"] = null;

  // Per body part totals
  const byBodyPart = new Map<string, { volume: number; sets: number }>();
  // Per exercise volume (for top list + most-trained candidates)
  const byExercise = new Map<string, { name: string; volume: number; sets: number }>();

  for (const r of rows) {
    const reps = Number(r.reps);
    const load = Number(r.load);
    if (reps <= 0 || load <= 0) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (r as any).workouts;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = (r as any).exercises;
    workoutIds.add(w.id);
    const vol = reps * load;
    totalVolume += vol;
    totalReps += reps;

    const bp = (ex.body_part as string) ?? "other";
    if (!byBodyPart.has(bp)) byBodyPart.set(bp, { volume: 0, sets: 0 });
    const b = byBodyPart.get(bp)!;
    b.volume += vol; b.sets += 1;

    if (!byExercise.has(ex.id)) byExercise.set(ex.id, { name: ex.name, volume: 0, sets: 0 });
    const e = byExercise.get(ex.id)!;
    e.volume += vol; e.sets += 1;

    if (!heaviest || load > heaviest.load) {
      heaviest = { exerciseName: ex.name, load, reps, date: w.performed_on };
    }
  }

  // Most-trained body part by volume
  let mostTrainedBP: RecapData["mostTrainedBodyPart"] = null;
  for (const [bp, v] of byBodyPart) {
    if (!mostTrainedBP || v.volume > mostTrainedBP.volume) {
      mostTrainedBP = { bodyPart: bp, bodyPartLabel: bodyPartLabel(bp), volume: Math.round(v.volume), sets: v.sets };
    }
  }

  // Most improved exercise: per exercise, compare best e1RM in first 25% of window vs last 25%
  // Only consider exercises with ≥3 sessions in each bucket to avoid noise
  const exerciseSets = new Map<string, { name: string; sessions: Map<string, number> }>();
  for (const r of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = (r as any).exercises;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (r as any).workouts.performed_on as string;
    const reps = Number(r.reps);
    const load = Number(r.load);
    if (reps <= 0 || load <= 0) continue;
    const e1 = calculateE1RM(load, reps);
    if (!exerciseSets.has(ex.id)) exerciseSets.set(ex.id, { name: ex.name, sessions: new Map() });
    const s = exerciseSets.get(ex.id)!;
    s.sessions.set(d, Math.max(s.sessions.get(d) ?? 0, e1));
  }

  const startTs = new Date(start + "T12:00:00").getTime();
  const endTs = new Date(end + "T12:00:00").getTime();
  const windowSpan = endTs - startTs;
  const splitFirst = startTs + windowSpan * 0.25;
  const splitLast = startTs + windowSpan * 0.75;

  let mostImproved: RecapData["mostImproved"] = null;
  for (const [exId, s] of exerciseSets) {
    const early: number[] = [];
    const late: number[] = [];
    for (const [d, e] of s.sessions) {
      const t = new Date(d + "T12:00:00").getTime();
      if (t <= splitFirst) early.push(e);
      else if (t >= splitLast) late.push(e);
    }
    if (early.length < 2 || late.length < 2) continue;
    const startBest = Math.max(...early);
    const endBest = Math.max(...late);
    if (startBest <= 0) continue;
    const pctGain = ((endBest - startBest) / startBest) * 100;
    if (!mostImproved || pctGain > mostImproved.pctGain) {
      mostImproved = {
        exerciseId: exId,
        exerciseName: s.name,
        startE1RM: Math.round(startBest),
        endE1RM: Math.round(endBest),
        pctGain: Math.round(pctGain * 10) / 10,
      };
    }
  }

  // PR count in this window
  const allPRs = await getAllPRs();
  const prCount = allPRs.filter((p) => p.date >= start && p.date <= end).length;

  // Streak summary (only meaningful for year-ish windows)
  const streak = await getStreakReport(3);

  // YoY: compare to prior period of same length
  let yoy: RecapData["yoy"] = null;
  if (period === "year" || period === "ytd" || period === "lastYear") {
    const prior = {
      year: { start: shiftYears(start, -1), end: shiftYears(end, -1) },
      ytd: { start: shiftYears(start, -1), end: shiftYears(end, -1) },
      lastYear: { start: shiftYears(start, -1), end: shiftYears(end, -1) },
      all: { start: "", end: "" },
    }[period];
    // A full prior year is several thousand set rows — paginate past the cap.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priorRows = await fetchAllRows<any>((from, to) =>
      supabase
        .from("sets")
        .select("reps, load, workouts!inner(id, performed_on)")
        .gte("workouts.performed_on", prior.start)
        .lte("workouts.performed_on", prior.end)
        .order("id")
        .range(from, to)
    );
    let pv = 0;
    const pws = new Set<string>();
    for (const r of priorRows) {
      const reps = Number(r.reps);
      const load = Number(r.load);
      if (reps <= 0 || load <= 0) continue;
      pv += reps * load;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pws.add((r as any).workouts.id);
    }
    const priorPRs = allPRs.filter((p) => p.date >= prior.start && p.date <= prior.end).length;
    yoy = {
      workoutsDeltaPct: pws.size > 0 ? Math.round(((workoutIds.size - pws.size) / pws.size) * 100) : null,
      volumeDeltaPct: pv > 0 ? Math.round(((totalVolume - pv) / pv) * 100) : null,
      prsDeltaPct: priorPRs > 0 ? Math.round(((prCount - priorPRs) / priorPRs) * 100) : null,
    };
  }

  const topExercisesByVolume = Array.from(byExercise.values())
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5)
    .map((e) => ({ exerciseName: e.name, volume: Math.round(e.volume), sets: e.sets }));

  return {
    period,
    label,
    windowStart: start,
    windowEnd: end,
    totalWorkouts: workoutIds.size,
    totalSets: rows.length,
    totalVolume: Math.round(totalVolume),
    totalReps,
    heaviestLift: heaviest,
    mostTrainedBodyPart: mostTrainedBP,
    mostImproved,
    prCount,
    currentStreakWeeks: streak.currentStreak,
    longestStreakWeeks: streak.longestStreak,
    yoy,
    topExercisesByVolume,
  };
}

function shiftYears(dateStr: string, years: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split("T")[0];
}
