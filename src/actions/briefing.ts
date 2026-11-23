"use server";

import { supabase } from "@/db";
import { todayLocal } from "@/lib/dates";
import { getTSB, type TSBStatus } from "@/actions/tsb";
import { getStreakReport } from "@/actions/streak";
import { getPlateauReport } from "@/actions/plateaus";
import { getETAProjections } from "@/actions/eta";
import { getLiftRatios } from "@/actions/ratios";
import { getRecentPRs } from "@/actions/sets";
import { getNextPlannedWorkout, getTodayPlannedSession } from "@/actions/routines";

export type BriefingAlert = {
  kind: "plateau" | "ratio" | "wellness" | "regression";
  severity: "warn" | "high";
  text: string;
  href: string;
};

export type BriefingPR = {
  exerciseId: string;
  exerciseName: string;
  side: string;
  e1rm: number;
  reps: number;
  load: number;
  daysAgo: number;
};

export type PlannedWorkout = {
  routineName: string;
  routineCurrentWeek: number;
  routineTotalWeeks: number;
  routineStartsOn: string | null;
  routineDaysUntilStart: number;
  // Cycle mode: length of the day-cycle (null = weekly/calendar routine).
  // When set, the session is "up next in sequence" — not tied to a weekday —
  // and dayNumber is the position within the cycle.
  cycleDays: number | null;
  // Strength template fields
  templateName: string | null;
  weekNumber: number;
  dayNumber: number;
  totalExercises: number;
  exercisePreview: string[];
  // Cardio fields
  cardioType: string | null;
  cardioNotes: string | null;
  cardioTemplateId: string | null;
  cardioTemplateName: string | null;
  cardioLoggedToday: boolean;
  // Per-week prescription notes (from routine_days.notes)
  weekNotes: string | null;
  alreadyDoneToday: boolean;
};

export type DailyBriefing = {
  date: string;
  // Planned workout from active routine
  planned: PlannedWorkout | null;
  // Readiness
  tsb: {
    value: number;
    status: TSBStatus;
    ctl: number;
    atl: number;
    delta7d: number;
  } | null;
  // Streak
  streak: {
    current: number;
    longest: number;
    weekWorkouts: number;
    weekGoal: number;
    hitRate: number;
  };
  // Alerts (ranked by severity)
  alerts: BriefingAlert[];
  // Coming up (closest ETAs)
  upcomingETAs: {
    exerciseName: string;
    nextTier: string;
    etaDays: number;
    etaDate: string;
  }[];
  // Recent PR (if within last 7 days)
  recentPR: BriefingPR | null;
  // 7-day snapshot
  snapshot: {
    workouts: number;
    volume: number;
    sets: number;
    prCount: number;
  };
  // Wellness
  wellness: {
    areaCount: number;
    checkinsToday: number;
    daysSinceLastCheckin: number | null;
  };
};

/**
 * Cheap briefing for mid-workout renders. The full briefing fires six heavy
 * sub-reports (plateaus, ETAs, ratios, PRs, …) and ~2s of query latency —
 * but during a workout it renders as a compact pill needing only TSB status
 * and the streak. Every logged set triggers a router.refresh() of the Today
 * page, so this is what keeps logging snappy.
 */
export async function getDailyBriefingLite(): Promise<DailyBriefing> {
  const [tsbReport, streakReport] = await Promise.all([getTSB(30), getStreakReport(3)]);
  const t = tsbReport.today;
  return {
    date: todayLocal(),
    planned: null,
    tsb: t
      ? {
          value: t.tsb,
          status: tsbReport.status,
          ctl: t.ctl,
          atl: t.atl,
          delta7d: tsbReport.tsbDelta7d,
        }
      : null,
    streak: {
      current: streakReport.currentStreak,
      longest: streakReport.longestStreak,
      weekWorkouts: 0,
      weekGoal: 3,
      hitRate: streakReport.hitRate,
    },
    alerts: [],
    upcomingETAs: [],
    recentPR: null,
    snapshot: { workouts: 0, volume: 0, sets: 0, prCount: 0 },
    wellness: { areaCount: 0, checkinsToday: 0, daysSinceLastCheckin: null },
  };
}

export async function getDailyBriefing(): Promise<DailyBriefing> {
  const todayStr = todayLocal();
  const today = new Date(todayStr + "T00:00:00");
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  // Fire everything in parallel
  const [
    tsbReport,
    streakReport,
    plateauReport,
    etaReport,
    ratioReport,
    recentPRs,
    weeklySetsData,
    weeklyWorkoutsData,
    areasData,
    todayCheckins,
    lastCheckin,
    activeRoutineExerciseIds,
  ] = await Promise.all([
    getTSB(30),
    getStreakReport(3),
    getPlateauReport(),
    getETAProjections(),
    getLiftRatios("90d"),
    getRecentPRs(7),
    supabase
      .from("sets")
      .select("reps, load, workouts!inner(performed_on)")
      .gte("workouts.performed_on", sevenDaysAgoStr),
    supabase
      .from("workouts")
      .select("id, performed_on")
      .gte("performed_on", sevenDaysAgoStr),
    supabase.from("injury_areas").select("id"),
    supabase.from("symptom_checkins").select("area_id").eq("checked_on", todayStr),
    supabase
      .from("symptom_checkins")
      .select("checked_on")
      .order("checked_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getActiveRoutineExerciseIdSet(),
  ]);

  // Use today-specific (calendar based) for the briefing, not sequence-based.
  // getNextPlannedWorkout is sequence-based and skips cardio days entirely.
  const plannedToday = await getTodayPlannedSession();
  // Keep the sequence-based one around in case nothing's scheduled today
  const plannedNext = !plannedToday?.day ? await getNextPlannedWorkout() : null;

  // TSB
  const t = tsbReport.today;
  const tsb = t ? {
    value: t.tsb,
    status: tsbReport.status,
    ctl: t.ctl,
    atl: t.atl,
    delta7d: tsbReport.tsbDelta7d,
  } : null;

  // Streak — count workouts in current week (Monday-anchored)
  const dow = today.getDay(); // 0 Sun .. 6 Sat
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const mondayStr = monday.toISOString().split("T")[0];
  const weekWorkouts = (weeklyWorkoutsData.data ?? [])
    .filter((w) => (w.performed_on as string) >= mondayStr).length;

  // Build alerts ranked by severity. Per-exercise alerts are filtered to
  // the active routine — exercises you've moved on from shouldn't nag you.
  // If no routine is active, fall back to all evaluated exercises.
  const filterToRoutine = (exerciseId: string) =>
    activeRoutineExerciseIds.size === 0 || activeRoutineExerciseIds.has(exerciseId);

  const alerts: BriefingAlert[] = [];

  // Regressing lifts (highest priority)
  for (const p of plateauReport.rows.filter((r) => r.status === "regressing" && filterToRoutine(r.exerciseId))) {
    alerts.push({
      kind: "regression",
      severity: "high",
      text: `${p.exerciseName} trending down (${p.slopeLbsPerWeek} lbs/wk)`,
      href: `/exercises/${p.exerciseId}`,
    });
  }

  // Stuck lifts (12+ weeks)
  for (const p of plateauReport.rows.filter((r) => r.status === "stuck" && filterToRoutine(r.exerciseId))) {
    alerts.push({
      kind: "plateau",
      severity: "high",
      text: `${p.exerciseName} stuck ${p.weeksSincePeak}w`,
      href: `/exercises/${p.exerciseId}`,
    });
  }

  // Out-of-range ratios with >20% deviation — ratios use user-curated benchmarks,
  // so no routine filter needed.
  for (const r of ratioReport.results) {
    if ((r.status === "low" || r.status === "high") && r.deltaFromTarget && r.deltaFromTarget >= 20) {
      alerts.push({
        kind: "ratio",
        severity: r.deltaFromTarget >= 35 ? "high" : "warn",
        text: `${r.def.label}: ${r.deltaFromTarget}% off target`,
        href: "/ratios",
      });
    }
  }

  // Plateau warnings (6-12 weeks)
  for (const p of plateauReport.rows.filter((r) => r.status === "plateau" && filterToRoutine(r.exerciseId))) {
    alerts.push({
      kind: "plateau",
      severity: "warn",
      text: `${p.exerciseName} plateaued ${p.weeksSincePeak}w`,
      href: `/exercises/${p.exerciseId}`,
    });
  }

  // Top 2 ETAs (within 90 days)
  const upcomingETAs = etaReport.rows
    .filter((r) => r.etaDays != null && r.etaDays <= 90)
    .slice(0, 2)
    .map((r) => ({
      exerciseName: r.exerciseName,
      nextTier: r.nextTier!,
      etaDays: r.etaDays!,
      etaDate: r.etaDate!,
    }));

  // Most recent PR (within last 7 days)
  const latestPR = recentPRs[0];
  const recentPR: BriefingPR | null = latestPR
    ? {
        exerciseId: latestPR.exerciseId,
        exerciseName: latestPR.exerciseName,
        side: latestPR.side,
        e1rm: Math.round(latestPR.e1rm),
        reps: latestPR.reps,
        load: latestPR.load,
        daysAgo: Math.floor(
          (today.getTime() - new Date(latestPR.date + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24)
        ),
      }
    : null;

  // 7-day snapshot
  let volume7d = 0;
  for (const s of weeklySetsData.data ?? []) {
    const r = Number(s.reps), l = Number(s.load);
    if (r > 0 && l > 0) volume7d += r * l;
  }
  const workoutIds7d = new Set((weeklyWorkoutsData.data ?? []).map((w) => w.id as string));
  const snapshot = {
    workouts: workoutIds7d.size,
    volume: Math.round(volume7d),
    sets: (weeklySetsData.data ?? []).length,
    prCount: recentPRs.length,
  };

  // Wellness state
  const areaCount = (areasData.data ?? []).length;
  const checkinsToday = (todayCheckins.data ?? []).length;
  let daysSinceLastCheckin: number | null = null;
  if (lastCheckin.data?.checked_on) {
    const lc = new Date(lastCheckin.data.checked_on + "T12:00:00").getTime();
    daysSinceLastCheckin = Math.floor((today.getTime() - lc) / (1000 * 60 * 60 * 24));
  }

  // Build planned-session summary. Today (calendar-based) wins; fall back to
  // next-in-sequence if today's slot is empty.
  let planned: PlannedWorkout | null = null;

  // Pre-start state: routine.started_on is in the future — show banner, no day plan
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (plannedToday && (plannedToday.routine as any)?.preStart) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rt = plannedToday.routine as any;
    planned = {
      routineName: rt.name as string,
      routineCurrentWeek: 1,
      routineTotalWeeks: (rt.weeks as number) ?? 1,
      routineStartsOn: (rt.started_on as string) ?? null,
      routineDaysUntilStart: (rt.daysUntilStart as number) ?? 0,
      cycleDays: (rt.cycle_days as number | null) ?? null,
      templateName: null,
      weekNumber: 1,
      dayNumber: 0,
      totalExercises: 0,
      exercisePreview: [],
      cardioType: null,
      cardioNotes: null,
      cardioTemplateId: null,
      cardioTemplateName: null,
      cardioLoggedToday: false,
      weekNotes: null,
      alreadyDoneToday: false,
    };
  } else if (plannedToday?.day) {
    const d = plannedToday.day;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rt = plannedToday.routine as any;
    const base = {
      routineName: rt.name as string,
      routineCurrentWeek: (rt.current_week as number) ?? d.week_number,
      routineTotalWeeks: (rt.weeks as number) ?? 1,
      routineStartsOn: (rt.started_on as string) ?? null,
      routineDaysUntilStart: 0,
      cycleDays: (rt.cycle_days as number | null) ?? null,
      weekNumber: d.week_number as number,
      dayNumber: d.day_number as number,
      weekNotes: d.notes ?? null,
      alreadyDoneToday: false,
    };
    if (d.template) {
      // Strength day (may also have a cardio template attached, e.g. Friday rower finisher)
      planned = {
        ...base,
        templateName: d.template.name as string,
        totalExercises: d.exercises?.length ?? 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exercisePreview: (d.exercises ?? []).slice(0, 4).map((e: any) => e.name as string),
        cardioType: null,
        cardioNotes: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cardioTemplateId: (d as any).cardio_template_id ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cardioTemplateName: (d as any).cardio_template?.name ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cardioLoggedToday: !!(d as any).cardio_logged_today,
      };
    } else if (d.planned_cardio_type || d.cardio_template_id) {
      // Pure cardio day
      planned = {
        ...base,
        templateName: null,
        totalExercises: 0,
        exercisePreview: [],
        cardioType: d.planned_cardio_type,
        cardioNotes: d.planned_cardio_notes,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cardioTemplateId: (d as any).cardio_template_id ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cardioTemplateName: (d as any).cardio_template?.name ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cardioLoggedToday: !!(d as any).cardio_logged_today,
      };
    }
  }

  // Fallback to next-in-sequence (legacy)
  if (!planned) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pn = plannedNext as any;
    if (pn?.next?.template && pn?.routine) {
      const exercises = pn.next.exercises ?? [];
      planned = {
        routineName: pn.routine.name as string,
        routineCurrentWeek: pn.next.weekNumber as number,
        routineTotalWeeks: (pn.routine.weeks as number) ?? 1,
        routineStartsOn: null,
        routineDaysUntilStart: 0,
        cycleDays: null,
        templateName: pn.next.template.name as string,
        weekNumber: pn.next.weekNumber as number,
        dayNumber: pn.next.dayNumber as number,
        totalExercises: exercises.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exercisePreview: exercises.slice(0, 4).map((e: any) => e.name as string),
        cardioType: null,
        cardioNotes: null,
        cardioTemplateId: null,
        cardioTemplateName: null,
        cardioLoggedToday: false,
        weekNotes: null,
        alreadyDoneToday: false,
      };
    }
  }

  return {
    date: todayStr,
    planned,
    tsb,
    streak: {
      current: streakReport.currentStreak,
      longest: streakReport.longestStreak,
      weekWorkouts,
      weekGoal: 3,
      hitRate: streakReport.hitRate,
    },
    alerts: alerts.slice(0, 5), // hard cap
    upcomingETAs,
    recentPR,
    snapshot,
    wellness: {
      areaCount,
      checkinsToday,
      daysSinceLastCheckin,
    },
  };
}

/**
 * Collects every exercise_id referenced by any template in the user's
 * currently-active routine. Used to scope alerts to "stuff I'm training now."
 * Returns an empty Set if no routine is active (alerts then fall back to all
 * actively-trained exercises).
 */
async function getActiveRoutineExerciseIdSet(): Promise<Set<string>> {
  const { data: activeRoutines } = await supabase
    .from("routines")
    .select("id")
    .eq("is_active", true)
    .limit(1);
  const routineId = activeRoutines?.[0]?.id as string | undefined;
  if (!routineId) return new Set();

  const { data: days } = await supabase
    .from("routine_days")
    .select("template_id")
    .eq("routine_id", routineId);

  const templateIds = [
    ...new Set((days ?? []).map((d) => d.template_id as string | null).filter((id): id is string => !!id)),
  ];
  if (templateIds.length === 0) return new Set();

  const { data: tex } = await supabase
    .from("template_exercises")
    .select("exercise_id")
    .in("template_id", templateIds);

  return new Set((tex ?? []).map((t) => t.exercise_id as string));
}
