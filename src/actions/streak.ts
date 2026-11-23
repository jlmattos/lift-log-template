"use server";

import { supabase } from "@/db";
import { todayLocal } from "@/lib/dates";

export type WeeklyStreak = {
  // The ISO date of the Monday for that week
  weekStart: string;
  workouts: number;
  hitGoal: boolean;
};

export type StreakReport = {
  goalPerWeek: number;
  currentStreak: number;
  longestStreak: number;
  weeks: WeeklyStreak[]; // newest first
  totalWeeksTracked: number;
  hitRate: number; // 0-100, % of weeks meeting goal
  weeksWithoutAnyWorkout: number;
};

function mondayOf(dateStr: string): string {
  // dateStr = YYYY-MM-DD (local). Use UTC math but anchor to noon to avoid TZ issues.
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay(); // 0 (Sun) .. 6 (Sat)
  const diff = day === 0 ? 6 : day - 1; // days back to Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().split("T")[0];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

export async function getStreakReport(goalPerWeek: number = 3): Promise<StreakReport> {
  // Pull every workout's performed_on (one row per workout, regardless of sets)
  const { data: workouts } = await supabase
    .from("workouts")
    .select("performed_on")
    .order("performed_on", { ascending: true });

  if (!workouts || workouts.length === 0) {
    return {
      goalPerWeek,
      currentStreak: 0,
      longestStreak: 0,
      weeks: [],
      totalWeeksTracked: 0,
      hitRate: 0,
      weeksWithoutAnyWorkout: 0,
    };
  }

  // Bucket by Monday-anchored week
  const byWeek = new Map<string, number>();
  for (const w of workouts) {
    const monday = mondayOf(w.performed_on as string);
    byWeek.set(monday, (byWeek.get(monday) ?? 0) + 1);
  }

  // Build a dense weekly array from the very first week to current week
  const firstWeek = mondayOf(workouts[0].performed_on as string);
  const today = todayLocal();
  const currentWeek = mondayOf(today);

  const weeksAsc: WeeklyStreak[] = [];
  let cursor = firstWeek;
  while (cursor <= currentWeek) {
    const count = byWeek.get(cursor) ?? 0;
    weeksAsc.push({
      weekStart: cursor,
      workouts: count,
      hitGoal: count >= goalPerWeek,
    });
    cursor = addDays(cursor, 7);
  }

  // Streak math (current = run ending in most recent week, longest = best ever)
  let longest = 0;
  let run = 0;
  for (const w of weeksAsc) {
    if (w.hitGoal) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  // Current streak = trailing run of hits ending at the latest week
  let current = 0;
  for (let i = weeksAsc.length - 1; i >= 0; i--) {
    if (weeksAsc[i].hitGoal) current += 1;
    else break;
  }

  const hits = weeksAsc.filter((w) => w.hitGoal).length;
  const totalWeeksTracked = weeksAsc.length;
  const hitRate = totalWeeksTracked > 0 ? Math.round((hits / totalWeeksTracked) * 100) : 0;
  const weeksWithoutAnyWorkout = weeksAsc.filter((w) => w.workouts === 0).length;

  return {
    goalPerWeek,
    currentStreak: current,
    longestStreak: longest,
    weeks: weeksAsc.reverse(), // newest first for UI
    totalWeeksTracked,
    hitRate,
    weeksWithoutAnyWorkout,
  };
}
