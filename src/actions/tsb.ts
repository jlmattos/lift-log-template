"use server";

import { supabase } from "@/db";
import { fetchAllRows } from "@/lib/paginate";

export type TSBDay = {
  date: string;
  strengthLoad: number;
  cardioLoad: number;
  totalLoad: number;
  ctl: number;          // 42-day EWA (chronic) — fitness
  atl: number;          // 7-day EWA (acute) — fatigue
  tsb: number;          // CTL - ATL — form
};

export type TSBStatus = "fresh" | "neutral" | "optimal" | "pushing" | "high-risk";

export type TSBReport = {
  days: TSBDay[];
  today: TSBDay | null;
  status: TSBStatus;
  // 7-day delta for trend hints
  ctlDelta7d: number;
  atlDelta7d: number;
  tsbDelta7d: number;
};

// Convert strength volume (reps × load lbs) to a training-stress unit
// roughly comparable to Strava's suffer_score scale. Calibrated so a typical
// 15-20k volume session lands in the 75-100 load range, matching a hard hour
// of cardio.
const STRENGTH_LOAD_DIVISOR = 200;

// EWA time constants (Coggan's standard CTL/ATL definitions)
const CTL_DAYS = 42;
const ATL_DAYS = 7;

function classify(tsb: number): TSBStatus {
  if (tsb > 5) return "fresh";
  if (tsb > -5) return "neutral";
  if (tsb > -15) return "optimal";
  if (tsb > -25) return "pushing";
  return "high-risk";
}

/**
 * Compute daily TSB time series over the last `daysBack` days.
 * Always loads an additional 60-day warm-up window so the EWA converges
 * before the visible window starts.
 */
export async function getTSB(daysBack: number = 90): Promise<TSBReport> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const displayStart = new Date(today);
  displayStart.setDate(displayStart.getDate() - daysBack);

  // Warm-up period for EWA convergence
  const warmStart = new Date(displayStart);
  warmStart.setDate(warmStart.getDate() - 60);
  const warmStartStr = warmStart.toISOString().split("T")[0];

  // Pull strength volume per day
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const strengthRows = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select("reps, load, workouts!inner(performed_on)")
      .gte("workouts.performed_on", warmStartStr)
      .range(from, to),
  );

  const strengthByDay = new Map<string, number>();
  for (const r of strengthRows) {
    const reps = Number(r.reps);
    const load = Number(r.load);
    if (reps <= 0 || load <= 0) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (r as any).workouts.performed_on as string;
    strengthByDay.set(d, (strengthByDay.get(d) ?? 0) + reps * load);
  }

  // Pull cardio load per day
  const { data: cardio } = await supabase
    .from("cardio_sessions")
    .select("performed_on, estimated_load")
    .gte("performed_on", warmStartStr);

  const cardioByDay = new Map<string, number>();
  for (const c of cardio ?? []) {
    const d = c.performed_on as string;
    cardioByDay.set(d, (cardioByDay.get(d) ?? 0) + Number(c.estimated_load ?? 0));
  }

  // Walk every day from warmStart → today
  const allDays: TSBDay[] = [];
  let ctl = 0;
  let atl = 0;
  const cursor = new Date(warmStart);
  while (cursor <= today) {
    const ds = cursor.toISOString().split("T")[0];
    const strengthLoad = (strengthByDay.get(ds) ?? 0) / STRENGTH_LOAD_DIVISOR;
    const cardioLoad = cardioByDay.get(ds) ?? 0;
    const totalLoad = strengthLoad + cardioLoad;

    // Exponentially-weighted moving averages (Coggan formula)
    ctl = ctl + (totalLoad - ctl) * (1 / CTL_DAYS);
    atl = atl + (totalLoad - atl) * (1 / ATL_DAYS);
    const tsb = ctl - atl;

    allDays.push({
      date: ds,
      strengthLoad: Math.round(strengthLoad * 10) / 10,
      cardioLoad: Math.round(cardioLoad * 10) / 10,
      totalLoad: Math.round(totalLoad * 10) / 10,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  // Slice to display window
  const displayStartStr = displayStart.toISOString().split("T")[0];
  const visible = allDays.filter((d) => d.date >= displayStartStr);

  const todayRow = visible[visible.length - 1] ?? null;
  const sevenDaysAgo = visible[visible.length - 8] ?? null;

  return {
    days: visible,
    today: todayRow,
    status: todayRow ? classify(todayRow.tsb) : "neutral",
    ctlDelta7d: todayRow && sevenDaysAgo ? Math.round((todayRow.ctl - sevenDaysAgo.ctl) * 10) / 10 : 0,
    atlDelta7d: todayRow && sevenDaysAgo ? Math.round((todayRow.atl - sevenDaysAgo.atl) * 10) / 10 : 0,
    tsbDelta7d: todayRow && sevenDaysAgo ? Math.round((todayRow.tsb - sevenDaysAgo.tsb) * 10) / 10 : 0,
  };
}
