"use server";

import { supabase } from "@/db";
import { fetchAllRows } from "@/lib/paginate";
import { type InjuryArea, type SymptomCheckin } from "@/actions/symptoms";

export type CorrelationDay = {
  date: string;
  severity: number | null;
  sleep: boolean;
  affectedWorkout: boolean;
  // Volume of body parts related to this injury area only
  relevantVolume: number;
  // Volume of all OTHER body parts (for context — shown lighter)
  otherVolume: number;
  bodyPartsTrained: string[];
};

export type LagResult = {
  lagDays: number;
  pearsonR: number;       // -1..1
  sampleSize: number;     // n pairs used
};

export type SymptomCorrelation = {
  area: InjuryArea;
  windowDays: number;
  days: CorrelationDay[];
  lags: LagResult[];
  bestLag: LagResult | null;
  // Threshold view: avg severity within 3 days after high-volume days vs low-volume days
  insight: {
    avgSeverityAfterHighVolume: number | null;
    avgSeverityAfterLowVolume: number | null;
    deltaPct: number | null;
    highVolumeThreshold: number;
  };
};

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return 0;
  return num / denom;
}

export async function getSymptomCorrelation(
  areaId: string,
  daysBack: number = 90
): Promise<SymptomCorrelation | null> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysBack);
  const startStr = start.toISOString().split("T")[0];

  const [areaRes, checkinsRes, sets] = await Promise.all([
    supabase.from("injury_areas").select("*").eq("id", areaId).single(),
    supabase.from("symptom_checkins").select("*").eq("area_id", areaId).gte("checked_on", startStr),
    // 90-day set windows pass the 1000-row cap — paginate with stable order.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchAllRows<any>((from, to) =>
      supabase
        .from("sets")
        .select("reps, load, workouts!inner(performed_on), exercises!inner(body_part)")
        .gte("workouts.performed_on", startStr)
        .order("id")
        .range(from, to)
    ),
  ]);

  const area = (areaRes.data as InjuryArea) ?? null;
  if (!area) return null;
  const checkins = (checkinsRes.data ?? []) as SymptomCheckin[];

  const related = new Set(area.related_body_parts ?? []);

  // Aggregate per day: relevant volume vs other volume, body parts trained
  const byDate = new Map<string, { relevant: number; other: number; bps: Set<string> }>();
  for (const r of sets) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const date = (r as any).workouts.performed_on as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bp = ((r as any).exercises.body_part as string) ?? "other";
    const reps = Number(r.reps);
    const load = Number(r.load);
    if (reps <= 0 || load <= 0) continue;
    const vol = reps * load;
    if (!byDate.has(date)) byDate.set(date, { relevant: 0, other: 0, bps: new Set() });
    const d = byDate.get(date)!;
    d.bps.add(bp);
    if (related.has(bp)) d.relevant += vol;
    else d.other += vol;
  }

  const checkinByDate = Object.fromEntries(checkins.map((c) => [c.checked_on, c])) as Record<
    string, SymptomCheckin
  >;

  // Build dense day series
  const days: CorrelationDay[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i <= daysBack; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d > today) break;
    const ds = d.toISOString().split("T")[0];
    const w = byDate.get(ds);
    const c = checkinByDate[ds];
    days.push({
      date: ds,
      severity: c?.severity ?? null,
      sleep: c?.affected_sleep ?? false,
      affectedWorkout: c?.affected_workout ?? false,
      relevantVolume: w?.relevant ?? 0,
      otherVolume: w?.other ?? 0,
      bodyPartsTrained: w ? Array.from(w.bps) : [],
    });
  }

  // Lag correlation: for each lag (0..3), pair (volume on day D) with (severity on day D+lag)
  const lags: LagResult[] = [];
  for (let lag = 0; lag <= 3; lag++) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < days.length - lag; i++) {
      const vol = days[i].relevantVolume;
      const sev = days[i + lag].severity;
      if (sev == null) continue;
      // Only include pairs where SOME training happened on day D (otherwise vol=0 dominates)
      // — but also include rest-day baseline if severity logged. Compromise: include all.
      xs.push(vol);
      ys.push(sev);
    }
    lags.push({
      lagDays: lag,
      pearsonR: Math.round(pearson(xs, ys) * 1000) / 1000,
      sampleSize: xs.length,
    });
  }
  const bestLag = lags
    .filter((l) => l.sampleSize >= 5)
    .sort((a, b) => Math.abs(b.pearsonR) - Math.abs(a.pearsonR))[0] ?? null;

  // Threshold insight: define "high volume day" = above median of nonzero relevant volume days
  const nonzeroVols = days.map((d) => d.relevantVolume).filter((v) => v > 0).sort((a, b) => a - b);
  const median = nonzeroVols.length ? nonzeroVols[Math.floor(nonzeroVols.length / 2)] : 0;
  const highVolumeThreshold = Math.round(median);

  // For each training day, look at average severity over next 1-3 days
  const sevAfter = (i: number): number | null => {
    const collected: number[] = [];
    for (let k = 1; k <= 3; k++) {
      const s = days[i + k]?.severity;
      if (s != null) collected.push(s);
    }
    return collected.length ? collected.reduce((a, b) => a + b, 0) / collected.length : null;
  };

  const highBucket: number[] = [];
  const lowBucket: number[] = [];
  for (let i = 0; i < days.length; i++) {
    const v = days[i].relevantVolume;
    if (v <= 0) continue;
    const s = sevAfter(i);
    if (s == null) continue;
    if (v > median) highBucket.push(s);
    else lowBucket.push(s);
  }

  const avgHigh = highBucket.length ? highBucket.reduce((a, b) => a + b, 0) / highBucket.length : null;
  const avgLow = lowBucket.length ? lowBucket.reduce((a, b) => a + b, 0) / lowBucket.length : null;
  const deltaPct = (avgHigh != null && avgLow != null && avgLow > 0)
    ? Math.round(((avgHigh - avgLow) / avgLow) * 100)
    : null;

  return {
    area,
    windowDays: daysBack,
    days,
    lags,
    bestLag,
    insight: {
      avgSeverityAfterHighVolume: avgHigh != null ? Math.round(avgHigh * 10) / 10 : null,
      avgSeverityAfterLowVolume: avgLow != null ? Math.round(avgLow * 10) / 10 : null,
      deltaPct,
      highVolumeThreshold,
    },
  };
}
