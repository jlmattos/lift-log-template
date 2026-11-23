"use server";

import { supabase } from "@/db";
import { fetchAllRows } from "@/lib/paginate";
import { todayLocal } from "@/lib/dates";
import { calculateE1RM, roundE1RM } from "@/lib/e1rm";
import { SEVERITY_LABELS } from "@/lib/symptoms";
import { formatDuration, computeWorkoutDuration } from "@/lib/format";
import { bodyPartCategory } from "@/lib/body-parts";

function weekRange(weekOffset: number) {
  // weekOffset 0 = current week (Mon–Sun), 1 = last week, ...
  const today = new Date(todayLocal() + "T00:00:00");
  const dow = today.getDay(); // Sun=0
  // Compute Monday of this week
  const monOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + monOffset - weekOffset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
    startDate: monday,
    endDate: sunday,
  };
}

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatLoad(n: number | string): string {
  const num = Number(n);
  return Number.isInteger(num) ? num.toString() : num.toFixed(2).replace(/\.?0+$/, "");
}

type SetRow = {
  set_index: number;
  side: string;
  reps: number;
  load: string | number;
  rpe: string | number | null;
};

type ExerciseInfo = {
  id: string;
  name: string;
  is_unilateral: boolean;
  equipment_type?: string;
  body_part?: string;
  equipment?: { name: string; bar_weight: number | string } | null;
};

function formatExerciseSets(sets: SetRow[], exercise: ExerciseInfo): string {
  if (sets.length === 0) return "  (no sets logged)";

  // Group by set_index
  const grouped = new Map<number, SetRow[]>();
  for (const s of sets) {
    if (!grouped.has(s.set_index)) grouped.set(s.set_index, []);
    grouped.get(s.set_index)!.push(s);
  }
  const setGroups = Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);

  const lines: string[] = [];
  for (const [idx, group] of setGroups) {
    if (exercise.is_unilateral) {
      const l = group.find((s) => s.side === "left");
      const r = group.find((s) => s.side === "right");
      const lStr = l ? `L: ${l.reps}×${formatLoad(l.load)}${l.rpe ? ` @RPE${l.rpe}` : ""}` : "L: —";
      const rStr = r ? `R: ${r.reps}×${formatLoad(r.load)}${r.rpe ? ` @RPE${r.rpe}` : ""}` : "R: —";
      lines.push(`  Set ${idx}: ${lStr} / ${rStr}`);
    } else {
      const s = group[0];
      lines.push(`  Set ${idx}: ${s.reps} × ${formatLoad(s.load)} lbs${s.rpe ? ` @ RPE ${s.rpe}` : ""}`);
    }
  }
  return lines.join("\n");
}

export async function getWeeklyDigest(weekOffset: number = 0) {
  const range = weekRange(weekOffset);

  // Fetch this week's workouts + sets + exercise info
  const { data: workouts } = await supabase
    .from("workouts")
    .select("*, template_id, templates(name)")
    .gte("performed_on", range.start)
    .lte("performed_on", range.end)
    .order("performed_on");

  // Fetch all sets joined with exercise info for these workouts
  const workoutIds = (workouts ?? []).map((w) => w.id as string);

  const setsByWorkout: Record<string, { exercise: ExerciseInfo; sets: SetRow[] }[]> = {};
  if (workoutIds.length > 0) {
    const q = (select: string) =>
      supabase
        .from("sets")
        .select(select as "*")
        .in("workout_id", workoutIds)
        .order("created_at");
    // Retry without the equipment embed while migration 0017 is unapplied.
    let { data: setRows } = await q("*, exercises(*, equipment(name, bar_weight))");
    if (!setRows) ({ data: setRows } = await q("*, exercises(*)"));

    for (const row of setRows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ex = (row as any).exercises as ExerciseInfo;
      const wid = row.workout_id as string;
      if (!setsByWorkout[wid]) setsByWorkout[wid] = [];
      let bucket = setsByWorkout[wid].find((b) => b.exercise.id === ex.id);
      if (!bucket) {
        bucket = { exercise: ex, sets: [] };
        setsByWorkout[wid].push(bucket);
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { exercises: _e, workout_id: _w, ...setData } = row as Record<string, unknown>;
      bucket.sets.push(setData as unknown as SetRow);
    }
  }

  // Compute summary stats: total volume, set count, body part breakdown
  let totalVolume = 0;
  let totalSets = 0;
  const bodyPartVolume: Record<string, number> = {
    push: 0,
    pull: 0,
    legs: 0,
    core: 0,
    other: 0,
  };

  for (const wid of workoutIds) {
    const buckets = setsByWorkout[wid] ?? [];
    for (const b of buckets) {
      const category = bodyPartCategory(b.exercise.body_part ?? "other");
      for (const s of b.sets) {
        const vol = Number(s.reps) * Number(s.load);
        totalVolume += vol;
        totalSets += 1;
        bodyPartVolume[category] = (bodyPartVolume[category] ?? 0) + vol;
      }
    }
  }

  // Compute previous week stats for comparison
  const prevRange = weekRange(weekOffset + 1);
  const { data: prevWorkouts } = await supabase
    .from("workouts")
    .select("id")
    .gte("performed_on", prevRange.start)
    .lte("performed_on", prevRange.end);

  const prevWorkoutIds = (prevWorkouts ?? []).map((w) => w.id as string);
  let prevVolume = 0;
  const prevSessions = prevWorkoutIds.length;
  if (prevWorkoutIds.length > 0) {
    const { data: prevSets } = await supabase
      .from("sets")
      .select("reps, load")
      .in("workout_id", prevWorkoutIds);
    for (const s of prevSets ?? []) {
      prevVolume += Number(s.reps) * Number(s.load);
    }
  }

  // PRs hit this week — best e1RM per (exercise, side) that beats prior best
  // Reuse logic: for each unique (exercise, side) in this week's sets, find best e1RM
  // and compare to prior best (excluding this week's workouts)
  const exerciseSideKey = new Map<
    string,
    {
      exerciseId: string;
      exerciseName: string;
      isUnilateral: boolean;
      side: string;
      bestE1rm: number;
      reps: number;
      load: number;
      date: string;
    }
  >();

  for (const w of workouts ?? []) {
    const buckets = setsByWorkout[w.id as string] ?? [];
    for (const b of buckets) {
      for (const s of b.sets) {
        const load = Number(s.load);
        const reps = Number(s.reps);
        if (reps <= 0 || load <= 0) continue;
        const e1rm = calculateE1RM(load, reps);
        const key = `${b.exercise.id}-${s.side}`;
        const existing = exerciseSideKey.get(key);
        if (!existing || e1rm > existing.bestE1rm) {
          exerciseSideKey.set(key, {
            exerciseId: b.exercise.id,
            exerciseName: b.exercise.name,
            isUnilateral: b.exercise.is_unilateral,
            side: s.side,
            bestE1rm: e1rm,
            reps,
            load,
            date: w.performed_on as string,
          });
        }
      }
    }
  }

  // For each candidate, check if there's a prior best higher than this
  const prs: typeof exerciseSideKey extends Map<string, infer V> ? V[] : never = [];
  for (const c of exerciseSideKey.values()) {
    // Big lifts approach 1000 lifetime rows — a truncated read understates
    // the prior best and mints false PRs. Paginate.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prior = await fetchAllRows<any>((from, to) =>
      supabase
        .from("sets")
        .select("reps, load, workouts!inner(performed_on)")
        .eq("exercise_id", c.exerciseId)
        .eq("side", c.side)
        .lt("workouts.performed_on", range.start)
        .order("id")
        .range(from, to)
    );

    let priorBest = 0;
    for (const p of prior) {
      const pload = Number(p.load);
      const preps = Number(p.reps);
      if (preps <= 0 || pload <= 0) continue;
      const pe = calculateE1RM(pload, preps);
      if (pe > priorBest) priorBest = pe;
    }
    if (c.bestE1rm > priorBest) {
      prs.push(c);
    }
  }

  // Fetch symptom data for the week
  const { data: symptomRows } = await supabase
    .from("symptom_checkins")
    .select("*, injury_areas(name)")
    .gte("checked_on", range.start)
    .lte("checked_on", range.end)
    .order("checked_on");

  // Group by area
  const symptomsByArea = new Map<
    string,
    {
      name: string;
      entries: {
        date: string;
        severity: number;
        affectedSleep: boolean;
        affectedWorkout: boolean;
        notes: string | null;
      }[];
    }
  >();
  for (const row of symptomRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const areaName = (row as any).injury_areas?.name as string;
    if (!areaName) continue;
    if (!symptomsByArea.has(areaName)) {
      symptomsByArea.set(areaName, { name: areaName, entries: [] });
    }
    symptomsByArea.get(areaName)!.entries.push({
      date: row.checked_on as string,
      severity: row.severity as number,
      affectedSleep: row.affected_sleep as boolean,
      affectedWorkout: row.affected_workout as boolean,
      notes: (row.notes as string | null) ?? null,
    });
  }

  // Build the markdown digest
  const lines: string[] = [];
  lines.push(`# Weekly Workout Digest`);
  lines.push("");
  lines.push(
    `**Week of ${range.startDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })} – ${range.endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}**`
  );
  lines.push("");

  // Summary
  lines.push(`## Summary`);
  const sessionCount = (workouts ?? []).length;
  const volChange =
    prevVolume > 0
      ? Math.round(((totalVolume - prevVolume) / prevVolume) * 100)
      : null;
  const sessChange =
    prevSessions > 0
      ? Math.round(((sessionCount - prevSessions) / prevSessions) * 100)
      : null;

  lines.push(
    `- **Sessions:** ${sessionCount}${prevSessions > 0 ? ` (vs ${prevSessions} last week${sessChange !== null ? `, ${sessChange >= 0 ? "+" : ""}${sessChange}%` : ""})` : ""}`
  );
  lines.push(`- **Total sets:** ${totalSets}`);
  lines.push(
    `- **Total volume:** ${Math.round(totalVolume).toLocaleString()} lbs${prevVolume > 0 ? ` (vs ${Math.round(prevVolume).toLocaleString()} last week${volChange !== null ? `, ${volChange >= 0 ? "+" : ""}${volChange}%` : ""})` : ""}`
  );
  lines.push("");

  // Body part breakdown
  if (totalVolume > 0) {
    lines.push(`## Volume by Body Part`);
    for (const [part, vol] of Object.entries(bodyPartVolume)) {
      if (vol === 0) continue;
      const pct = ((vol / totalVolume) * 100).toFixed(1);
      lines.push(
        `- **${part.charAt(0).toUpperCase() + part.slice(1)}:** ${Math.round(vol).toLocaleString()} lbs (${pct}%)`
      );
    }
    lines.push("");
  }

  // PRs
  if (prs.length > 0) {
    lines.push(`## Personal Records (${prs.length})`);
    for (const pr of prs) {
      const sideStr = pr.side === "both" ? "" : ` (${pr.side.charAt(0).toUpperCase()})`;
      lines.push(
        `- 🏆 **${pr.exerciseName}${sideStr}** — new best e1RM **${roundE1RM(pr.bestE1rm)} lbs** from ${pr.reps}×${formatLoad(pr.load)} on ${formatDateLong(pr.date)}`
      );
    }
    lines.push("");
  }

  // Symptoms / Recovery
  if (symptomsByArea.size > 0) {
    lines.push(`## Symptoms & Recovery`);
    lines.push("");
    for (const { name, entries } of symptomsByArea.values()) {
      if (entries.length === 0) continue;
      const avgSev = (entries.reduce((sum, e) => sum + e.severity, 0) / entries.length).toFixed(1);
      const maxSev = Math.max(...entries.map((e) => e.severity));
      const sleepDays = entries.filter((e) => e.affectedSleep).length;
      const workoutDays = entries.filter((e) => e.affectedWorkout).length;

      lines.push(`### ${name}`);
      lines.push(
        `- **Days logged:** ${entries.length} / 7`
      );
      lines.push(
        `- **Average severity:** ${avgSev} (peak: ${maxSev} — ${SEVERITY_LABELS[maxSev]})`
      );
      if (sleepDays > 0) {
        lines.push(`- **Sleep affected:** ${sleepDays} night${sleepDays !== 1 ? "s" : ""}`);
      }
      if (workoutDays > 0) {
        lines.push(`- **Workout affected:** ${workoutDays} day${workoutDays !== 1 ? "s" : ""}`);
      }

      // Detailed timeline of entries with non-zero severity or any flag
      const noteworthy = entries.filter(
        (e) => e.severity > 0 || e.affectedSleep || e.affectedWorkout || e.notes
      );
      if (noteworthy.length > 0) {
        lines.push(``);
        for (const e of noteworthy) {
          const dateLabel = new Date(e.date + "T12:00:00").toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
          const flags: string[] = [];
          if (e.affectedSleep) flags.push("sleep");
          if (e.affectedWorkout) flags.push("workout");
          const flagStr = flags.length > 0 ? ` ⚠ ${flags.join("+")}` : "";
          const noteStr = e.notes ? ` — *${e.notes}*` : "";
          lines.push(
            `  - ${dateLabel}: severity ${e.severity} (${SEVERITY_LABELS[e.severity]})${flagStr}${noteStr}`
          );
        }
      }
      lines.push("");
    }
  }

  // Workouts
  if (sessionCount > 0) {
    lines.push(`## Workouts`);
    lines.push("");

    for (const w of workouts ?? []) {
      const dateStr = formatDateLong(w.performed_on as string);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const templateName = (w as any).templates?.name;
      lines.push(
        `### ${dateStr}${templateName ? ` — ${templateName}` : ""}`
      );

      const buckets = setsByWorkout[w.id as string] ?? [];

      // Duration + notes header for this workout
      const allSets = buckets.flatMap((b) => b.sets);
      const duration = formatDuration(computeWorkoutDuration(allSets));
      const meta: string[] = [];
      if (duration) meta.push(`Duration: ${duration}`);
      if (meta.length > 0) {
        lines.push(`*${meta.join(" · ")}*`);
      }
      if (w.notes) {
        lines.push(``);
        lines.push(`> ${(w.notes as string).split("\n").join("\n> ")}`);
      }
      lines.push(``);

      if (buckets.length === 0) {
        lines.push(`*No exercises logged*`);
      } else {
        for (const b of buckets) {
          const tags: string[] = [];
          if (b.exercise.equipment) tags.push(b.exercise.equipment.name);
          else if (b.exercise.equipment_type === "barbell") tags.push("BB");
          if (b.exercise.is_unilateral) tags.push("L/R");
          const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
          lines.push(`**${b.exercise.name}**${tagStr}`);
          lines.push(formatExerciseSets(b.sets, b.exercise));
          lines.push("");
        }
      }
      lines.push("");
    }
  } else {
    lines.push(`## Workouts`);
    lines.push("");
    lines.push(`*No workouts logged this week.*`);
  }

  return {
    range: {
      start: range.start,
      end: range.end,
      startLabel: range.startDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      endLabel: range.endDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    },
    markdown: lines.join("\n"),
    stats: {
      sessions: sessionCount,
      sets: totalSets,
      volume: Math.round(totalVolume),
      prs: prs.length,
    },
  };
}
