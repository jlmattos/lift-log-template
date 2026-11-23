"use server";

import { supabase } from "@/db";
import { getTSB } from "@/actions/tsb";

export type WellnessTSBPoint = {
  date: string;
  tsb: number;
  severity: number;
};

export type WellnessTSBInsight = {
  windowDays: number;
  sampleSize: number;          // # of days with both a check-in and TSB
  pearsonR: number | null;     // correlation of TSB vs severity (negative = more fatigue → more pain)
  // Threshold finding: severity when TSB is below the threshold vs at/above it
  threshold: number | null;    // the TSB cutoff with the strongest severity spike
  avgSeverityBelow: number | null;
  avgSeverityAtOrAbove: number | null;
  deltaPct: number | null;     // how much higher severity runs below the threshold
  daysBelowThreshold: number;
  points: WellnessTSBPoint[];
  // Live status: how today's TSB sits relative to the danger threshold
  todayTsb: number | null;
  inDangerZone: boolean;
  headline: string;
};

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 4) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return null;
  return num / denom;
}

/**
 * Correlate symptom severity against Training Stress Balance.
 *
 * The actionable question: "does my pain spike when I'm deep in fatigue
 * (negative TSB)?" We pair each daily check-in's severity (max across all
 * tracked areas that day) with that day's TSB, then sweep candidate TSB
 * thresholds to find the cutoff where severity jumps the most.
 */
export async function getWellnessTSBInsight(
  daysBack = 90,
): Promise<WellnessTSBInsight> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysBack);
  const startStr = start.toISOString().split("T")[0];

  const [tsbReport, checkinsRes] = await Promise.all([
    getTSB(daysBack),
    supabase
      .from("symptom_checkins")
      .select("checked_on, severity")
      .gte("checked_on", startStr),
  ]);

  const tsbByDate = new Map<string, number>();
  for (const d of tsbReport.days) tsbByDate.set(d.date, d.tsb);

  // Max severity per day across all areas (worst symptom that day).
  const sevByDate = new Map<string, number>();
  for (const c of checkinsRes.data ?? []) {
    const date = c.checked_on as string;
    const sev = Number(c.severity);
    sevByDate.set(date, Math.max(sevByDate.get(date) ?? 0, sev));
  }

  // Pair days that have both a TSB value and a check-in.
  const points: WellnessTSBPoint[] = [];
  for (const [date, severity] of sevByDate) {
    const tsb = tsbByDate.get(date);
    if (tsb == null) continue;
    points.push({ date, tsb, severity });
  }
  points.sort((a, b) => (a.date < b.date ? -1 : 1));

  const todayTsb = tsbReport.today?.tsb ?? null;

  const empty: WellnessTSBInsight = {
    windowDays: daysBack,
    sampleSize: points.length,
    pearsonR: null,
    threshold: null,
    avgSeverityBelow: null,
    avgSeverityAtOrAbove: null,
    deltaPct: null,
    daysBelowThreshold: 0,
    points,
    todayTsb,
    inDangerZone: false,
    headline:
      points.length < 5
        ? "Not enough overlapping data yet — keep logging daily check-ins to unlock this."
        : "No clear link between fatigue and symptoms in this window.",
  };

  if (points.length < 5) return empty;

  const r = pearson(points.map((p) => p.tsb), points.map((p) => p.severity));

  // Sweep candidate thresholds; pick the one with the biggest severity spike
  // below it (and at least 3 days on each side to be meaningful).
  const candidates = [5, 0, -5, -10, -15, -20, -25];
  let best: {
    threshold: number;
    below: number;
    atOrAbove: number;
    deltaPct: number;
    daysBelow: number;
  } | null = null;

  for (const th of candidates) {
    const belowVals = points.filter((p) => p.tsb < th).map((p) => p.severity);
    const aboveVals = points.filter((p) => p.tsb >= th).map((p) => p.severity);
    if (belowVals.length < 3 || aboveVals.length < 3) continue;
    const avgBelow = belowVals.reduce((a, b) => a + b, 0) / belowVals.length;
    const avgAbove = aboveVals.reduce((a, b) => a + b, 0) / aboveVals.length;
    if (avgAbove <= 0) continue;
    const deltaPct = Math.round(((avgBelow - avgAbove) / avgAbove) * 100);
    if (!best || deltaPct > best.deltaPct) {
      best = {
        threshold: th,
        below: Math.round(avgBelow * 10) / 10,
        atOrAbove: Math.round(avgAbove * 10) / 10,
        deltaPct,
        daysBelow: belowVals.length,
      };
    }
  }

  if (!best || best.deltaPct < 15) {
    // No meaningful spike found.
    return { ...empty, pearsonR: r != null ? Math.round(r * 100) / 100 : null };
  }

  const inDangerZone = todayTsb != null && todayTsb < best.threshold;
  const sign = best.threshold >= 0 ? `+${best.threshold}` : `${best.threshold}`;

  const headline = inDangerZone
    ? `⚠ You're in the danger zone — TSB ${todayTsb! >= 0 ? "+" : ""}${todayTsb} is below ${sign}, where your symptoms run ${best.deltaPct}% worse. Consider a lighter day.`
    : `When TSB drops below ${sign}, your symptoms run ${best.deltaPct}% worse (avg severity ${best.below} vs ${best.atOrAbove}). You're currently above that line.`;

  return {
    windowDays: daysBack,
    sampleSize: points.length,
    pearsonR: r != null ? Math.round(r * 100) / 100 : null,
    threshold: best.threshold,
    avgSeverityBelow: best.below,
    avgSeverityAtOrAbove: best.atOrAbove,
    deltaPct: best.deltaPct,
    daysBelowThreshold: best.daysBelow,
    points,
    todayTsb,
    inDangerZone,
    headline,
  };
}
