// Tool definitions + execution for the Claude fitness advisor.
// Each tool wraps an existing server action and returns its JSON output.

import type { Anthropic } from "@anthropic-ai/sdk";

import { getUserContext } from "@/actions/user-context";
import { getProfile, getLatestBodyweight, getStrengthDashboard } from "@/actions/strength";
import { getStrengthHeatmap } from "@/actions/strength-heatmap";
import { listInjuryAreas, getSymptomTrend } from "@/actions/symptoms";
import { getSymptomCorrelation } from "@/actions/correlation";
import { getTSB } from "@/actions/tsb";
import { getPlateauReport } from "@/actions/plateaus";
import { getETAProjections } from "@/actions/eta";
import { getAsymmetryLeaderboard } from "@/actions/asymmetry";
import { getLiftRatios } from "@/actions/ratios";
import { getMuscleVolumes } from "@/actions/silhouette";
import { getRecentPRs, getExerciseHistory } from "@/actions/sets";
import { getAllPRs } from "@/actions/pr-timeline";
import { getStreakReport } from "@/actions/streak";
import { getRecap } from "@/actions/recap";
import { listCardioSessions } from "@/actions/cardio";
import { listWorkouts, getWorkoutWithSets } from "@/actions/workouts";
import { listExercises } from "@/actions/exercises";
import { getNextPlannedWorkout, getActiveRoutineFull, listRoutines } from "@/actions/routines";
import { getTemplate, listTemplates } from "@/actions/templates";
import { listExerciseNotes } from "@/actions/exercise-notes";
import { listBodyweightLogs } from "@/actions/strength";
import { listCardioTemplates } from "@/actions/cardio-templates";
import type { WindowKey } from "@/lib/windows";

type Tool = Anthropic.Messages.Tool;

// Window enum reused across many tools
const WINDOW_SCHEMA = {
  type: "string" as const,
  enum: ["7d", "30d", "90d", "365d", "all"],
  description: "Time window. '90d' is the default 'current capacity' window.",
};

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "get_user_context",
    description: "Get the user's profile context: sex, current bodyweight, injuries (with status + training modifications), goals, training style, and free-form notes. Always call this first if you don't have it cached — it tells you who you're advising.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_active_routine",
    description: "Get JUST today's planned workout from the active routine (template + exercises queued for today). Use this for 'what am I doing today' questions. For FULL routine review (all weeks, all days, every exercise across the program), use get_active_routine_full instead.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_active_routine_full",
    description: "Get the COMPLETE active routine: every week, every day, every template, every exercise with sets/reps targets. Use this whenever the user asks you to review, audit, or modify their routine — never rely on get_active_routine alone for that, it only returns today's workout. Returns a `schedule` array spanning all weeks.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_template_detail",
    description: "Get a specific template's full exercise list with targets (sets, reps, position). Use to inspect a workout in detail after seeing it in get_active_routine_full.",
    input_schema: {
      type: "object",
      properties: {
        template_id: { type: "string", description: "Template UUID from get_active_routine_full." },
      },
      required: ["template_id"],
    },
  },
  {
    name: "get_recent_workouts",
    description: "List recent workouts with set summaries. Use to see what the user has actually been training.",
    input_schema: {
      type: "object",
      properties: {
        days_back: { type: "number", description: "How many days back to fetch. Default 14." },
        limit: { type: "number", description: "Max workouts to return. Default 20." },
      },
      required: [],
    },
  },
  {
    name: "get_workout_detail",
    description: "Get every set logged in a specific workout. Use when a recent_workouts call surfaced a session worth diving into.",
    input_schema: {
      type: "object",
      properties: {
        workout_id: { type: "string", description: "The UUID of the workout (from get_recent_workouts)." },
      },
      required: ["workout_id"],
    },
  },
  {
    name: "get_exercise_history",
    description: "Get every set ever logged for a specific exercise, grouped by session. Use to deep-dive on one lift's trajectory.",
    input_schema: {
      type: "object",
      properties: {
        exercise_id: { type: "string", description: "The UUID of the exercise (from list_exercises or other tools)." },
        limit: { type: "number", description: "Max sessions to return. Default 30." },
      },
      required: ["exercise_id"],
    },
  },
  {
    name: "list_exercises",
    description: "Search the user's exercise library by name or body part. Use to find exercise UUIDs to pass to other tools.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Optional name substring to filter." },
      },
      required: [],
    },
  },
  {
    name: "get_strength_dashboard",
    description: "User's strength tier benchmarks (Beginner/Novice/Intermediate/Advanced/Elite) per benchmark lift, vs StrengthLevel standards at their bodyweight. Shows current capacity per lift.",
    input_schema: {
      type: "object",
      properties: {
        window: { type: "string", enum: ["90d", "all"], description: "'90d' = current capacity (default), 'all' = lifetime peak." },
      },
      required: [],
    },
  },
  {
    name: "get_strength_heatmap",
    description: "Per-body-part strength tier, derived from benchmark lifts. Use to see which muscle groups are strong vs weak relative to standards.",
    input_schema: {
      type: "object",
      properties: { window: WINDOW_SCHEMA },
      required: [],
    },
  },
  {
    name: "get_tsb_status",
    description: "Training Stress Balance trajectory: daily CTL (fitness, 42d EWA), ATL (fatigue, 7d EWA), and TSB (form) combining strength + cardio. Use to assess recovery state and fatigue accumulation.",
    input_schema: {
      type: "object",
      properties: {
        days_back: { type: "number", description: "Days of trajectory. Default 60." },
      },
      required: [],
    },
  },
  {
    name: "get_plateau_report",
    description: "Cross-exercise plateau analysis: every actively-trained lift bucketed as fresh/stalled/plateau/stuck/regressing, with weeks-since-peak and recent slope. Use to find lifts that need intervention.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_eta_projections",
    description: "Linear-regression projections for when each benchmark lift will hit the next StrengthLevel tier at current rate.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_asymmetry_leaderboard",
    description: "Left vs right e1RM gap across every unilateral exercise. Use to spot strength imbalances that need targeted work.",
    input_schema: {
      type: "object",
      properties: {
        days_back: { type: "number", description: "Window in days. Default 90." },
      },
      required: [],
    },
  },
  {
    name: "get_lift_ratios",
    description: "Strength balance ratios (Press:Pull, OHP:Bench, Squat:DL, RDL:Squat, Pull-up:Press) vs healthy target bands. Use to spot dangerous imbalances.",
    input_schema: {
      type: "object",
      properties: { window: WINDOW_SCHEMA },
      required: [],
    },
  },
  {
    name: "get_muscle_volumes",
    description: "Per-muscle training volume (reps × load) in a window. Use to see volume distribution across body parts.",
    input_schema: {
      type: "object",
      properties: {
        days_back: { type: "number", description: "Window in days. Default 30. Use null for all-time." },
      },
      required: [],
    },
  },
  {
    name: "get_cardio_sessions",
    description: "Strava-synced cardio activities (cycling, rowing, running, hiking) with duration, distance, HR, and estimated training load.",
    input_schema: {
      type: "object",
      properties: {
        days_back: { type: "number", description: "Window in days. Default 30." },
      },
      required: [],
    },
  },
  {
    name: "get_recent_prs",
    description: "Personal records set in a recent window. For all-time PR history use get_all_prs instead.",
    input_schema: {
      type: "object",
      properties: {
        days_back: { type: "number", description: "Window in days. Default 30." },
      },
      required: [],
    },
  },
  {
    name: "get_all_prs",
    description: "Every PR ever set, chronologically. Use sparingly — this can be a lot of data.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_streak_report",
    description: "Weekly training consistency: current streak, longest streak, hit rate, week-by-week history.",
    input_schema: {
      type: "object",
      properties: {
        goal_per_week: { type: "number", description: "Workouts/week to count as 'hit'. Default 3." },
      },
      required: [],
    },
  },
  {
    name: "get_recap",
    description: "Period summary: workouts, volume, PRs, most-improved exercise, most-trained body part, heaviest lift, YoY deltas.",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["year", "ytd", "lastYear", "all"], description: "Default 'year' = trailing 365 days." },
      },
      required: [],
    },
  },
  {
    name: "get_exercise_notes",
    description: "Sticky notes the user has written about a specific exercise (form cues, weight settings, why they chose it, etc.). Important context for understanding programming intent.",
    input_schema: {
      type: "object",
      properties: {
        exercise_id: { type: "string", description: "Exercise UUID." },
      },
      required: ["exercise_id"],
    },
  },
  {
    name: "list_templates",
    description: "List every workout template in the user's library (not just active routine ones). Use to see templates they might rotate in.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_routines",
    description: "List every routine the user has created (active + past). Use to compare programming history.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_cardio_templates",
    description: "List all cardio templates (VO2 Max, Zone 2, Zone 2 + HIIT, Sprints, Shred Shed) with their prescriptions, allowed modalities (the protocol is picked, then the modality — bike/rower/run/ruck/walk — at log time), and which metrics each tracks.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_bodyweight_history",
    description: "Full bodyweight history with dates. Use to see weight trend (cut, bulk, maintenance).",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max entries. Default 90." },
      },
      required: [],
    },
  },
  {
    name: "get_wellness_correlation",
    description: "Symptom × training correlation for a specific injury area: daily severity overlaid with relevant body-part volume, lag correlations at 0-3 day lag, high-vs-low-volume severity comparison. Powerful for diagnosing 'does this exercise trigger pain?'",
    input_schema: {
      type: "object",
      properties: {
        area_id: { type: "string", description: "Injury area UUID (from get_user_context)." },
        days_back: { type: "number", description: "Window in days. Default 90." },
      },
      required: ["area_id"],
    },
  },
];

// ─── Tool execution ──────────────────────────────────────────────────────

// Helper: clamp + default
const defaultDays = (d: unknown, fallback: number): number =>
  typeof d === "number" && d > 0 ? Math.min(d, 730) : fallback;

/**
 * Build a short human-readable summary of what a tool returned, so the UI
 * can show "✓ get_active_routine_full (38 exercises across 8 days)" instead
 * of a vague success badge. Helps the user trust that Claude actually saw
 * the data, not just hit the endpoint.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function summarizeResult(name: string, result: any): string {
  if (!result || (result as { error?: string }).error) return "error";
  try {
    switch (name) {
      case "get_user_context": {
        const injuries = result.injuries?.length ?? 0;
        return `BW ${result.bodyweight_lbs ?? "?"} · ${injuries} injuries · goals/style/notes loaded`;
      }
      case "get_active_routine_full": {
        const days = result.schedule?.length ?? 0;
        const totalEx = (result.schedule ?? []).reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s: number, d: any) => s + (d.exercises?.length ?? 0), 0
        );
        return `${result.name} · ${result.weeks}w · ${days} days · ${totalEx} exercise slots`;
      }
      case "get_active_routine":
        return result?.next?.template?.name
          ? `Today: ${result.next.template.name} (${result.next.exercises?.length ?? 0} exercises)`
          : "no workout queued";
      case "get_recent_workouts":
        return `${Array.isArray(result) ? result.length : 0} workouts`;
      case "get_workout_detail":
        return `${result?.exercises?.length ?? 0} exercises, ${(result?.exercises ?? []).reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s: number, e: any) => s + (e.sets?.length ?? 0), 0
        )} sets`;
      case "get_exercise_history":
        return `${Array.isArray(result) ? result.length : 0} sessions`;
      case "list_exercises":
        return `${Array.isArray(result) ? result.length : 0} exercises`;
      case "get_strength_dashboard":
        return `${result?.benchmarks?.length ?? 0} benchmarks`;
      case "get_strength_heatmap":
        return `${Object.keys(result?.byMuscle ?? {}).length} muscles tiered`;
      case "get_tsb_status":
        return result?.today
          ? `TSB ${result.today.tsb > 0 ? "+" : ""}${result.today.tsb} · ${result.status} · ${result.days?.length ?? 0}d`
          : "no data";
      case "get_plateau_report":
        return `${result?.rows?.length ?? 0} active lifts evaluated`;
      case "get_eta_projections":
        return `${result?.rows?.length ?? 0} benchmarks projected`;
      case "get_asymmetry_leaderboard":
        return `${result?.rows?.length ?? 0} unilateral lifts`;
      case "get_lift_ratios":
        return `${result?.results?.length ?? 0} ratios`;
      case "get_muscle_volumes":
        return `${Object.keys(result?.byMuscle ?? {}).length} muscles · ${result?.totalVolume?.toLocaleString?.() ?? 0} lbs`;
      case "get_cardio_sessions":
        return `${Array.isArray(result) ? result.length : 0} cardio sessions`;
      case "get_recent_prs":
      case "get_all_prs":
        return `${Array.isArray(result) ? result.length : 0} PRs`;
      case "get_streak_report":
        return `${result?.currentStreak ?? 0}w current · ${result?.longestStreak ?? 0}w best · ${result?.hitRate ?? 0}% hit rate`;
      case "get_recap":
        return `${result?.totalWorkouts ?? 0} workouts · ${result?.totalVolume?.toLocaleString?.() ?? 0} lbs · ${result?.prCount ?? 0} PRs`;
      case "get_wellness_correlation":
        return `${result?.days?.length ?? 0}d · ${result?.lags?.length ?? 0} lags · best r=${result?.bestLag?.pearsonR ?? "n/a"}`;
      case "get_exercise_notes":
        return `${Array.isArray(result) ? result.length : 0} notes`;
      case "list_templates":
        return `${Array.isArray(result) ? result.length : 0} templates`;
      case "list_routines":
        return `${Array.isArray(result) ? result.length : 0} routines`;
      case "list_cardio_templates":
        return `${Array.isArray(result) ? result.length : 0} cardio templates`;
      case "get_bodyweight_history":
        return `${Array.isArray(result) ? result.length : 0} weigh-ins`;
      case "get_template_detail":
        return result?.exercises?.length != null ? `${result.exercises.length} exercises` : "loaded";
      default:
        return "loaded";
    }
  } catch {
    return "loaded";
  }
}

const windowKey = (w: unknown, fallback: WindowKey = "90d"): WindowKey => {
  if (typeof w === "string" && ["7d", "30d", "90d", "365d", "all"].includes(w)) {
    return w as WindowKey;
  }
  return fallback;
};

/**
 * Execute a tool call and return JSON-serializable result.
 * Errors are caught and returned as { error: string } so the model can recover.
 */
export async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case "get_user_context": {
        const [ctx, profile, bw, injuries] = await Promise.all([
          getUserContext(),
          getProfile(),
          getLatestBodyweight(),
          listInjuryAreas(),
        ]);
        return {
          sex: profile.sex,
          bodyweight_lbs: bw?.weight_lbs ?? null,
          bodyweight_logged_on: bw?.measured_on ?? null,
          goals: ctx?.goals ?? null,
          training_style: ctx?.training_style ?? null,
          notes: ctx?.notes ?? null,
          injuries: injuries.map((i) => ({
            id: i.id,
            name: i.name,
            description: i.description,
            status: i.status,
            training_modifications: i.training_modifications,
            related_body_parts: i.related_body_parts,
            started_on: i.started_on,
          })),
        };
      }

      case "get_active_routine":
        return await getNextPlannedWorkout();

      case "get_active_routine_full":
        return await getActiveRoutineFull();

      case "get_template_detail":
        return await getTemplate(input.template_id as string);

      case "get_exercise_notes":
        return await listExerciseNotes(input.exercise_id as string);

      case "list_templates":
        return await listTemplates();

      case "list_routines":
        return await listRoutines();

      case "get_bodyweight_history":
        return await listBodyweightLogs(defaultDays(input.limit, 90));

      case "list_cardio_templates":
        return await listCardioTemplates();

      case "get_recent_workouts": {
        const days = defaultDays(input.days_back, 14);
        const limit = defaultDays(input.limit, 20);
        const workouts = await listWorkouts(limit);
        const start = new Date();
        start.setDate(start.getDate() - days);
        const startStr = start.toISOString().split("T")[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return workouts.filter((w: any) => (w.performed_on as string) >= startStr);
      }

      case "get_workout_detail":
        return await getWorkoutWithSets(input.workout_id as string);

      case "get_exercise_history": {
        const limit = defaultDays(input.limit, 30);
        return await getExerciseHistory(input.exercise_id as string, limit);
      }

      case "list_exercises": {
        const all = await listExercises();
        const search = (input.search as string | undefined)?.toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (all as any[])
          .filter((e) => !search || (e.name as string).toLowerCase().includes(search))
          .map((e) => ({
            id: e.id,
            name: e.name,
            body_part: e.body_part,
            is_unilateral: e.is_unilateral,
            equipment_type: e.equipment_type,
            equipment: e.equipment
              ? { name: e.equipment.name, bar_weight: Number(e.equipment.bar_weight) }
              : null,
          }));
      }

      case "get_strength_dashboard":
        return await getStrengthDashboard(input.window === "all" ? "all" : "90d");

      case "get_strength_heatmap":
        return await getStrengthHeatmap(windowKey(input.window, "90d"));

      case "get_tsb_status":
        return await getTSB(defaultDays(input.days_back, 60));

      case "get_plateau_report":
        return await getPlateauReport();

      case "get_eta_projections":
        return await getETAProjections();

      case "get_asymmetry_leaderboard":
        return await getAsymmetryLeaderboard(defaultDays(input.days_back, 90));

      case "get_lift_ratios":
        return await getLiftRatios(windowKey(input.window, "90d"));

      case "get_muscle_volumes": {
        const d = input.days_back === null ? null : defaultDays(input.days_back, 30);
        return await getMuscleVolumes(d);
      }

      case "get_cardio_sessions":
        return await listCardioSessions(defaultDays(input.days_back, 30));

      case "get_recent_prs":
        return await getRecentPRs(defaultDays(input.days_back, 30));

      case "get_all_prs":
        return await getAllPRs();

      case "get_streak_report":
        return await getStreakReport(defaultDays(input.goal_per_week, 3));

      case "get_recap":
        return await getRecap((input.period as "year" | "ytd" | "lastYear" | "all") ?? "year");

      case "get_wellness_correlation": {
        const days = defaultDays(input.days_back, 90);
        return await getSymptomCorrelation(input.area_id as string, days);
      }

      // legacy fallback tool name
      case "get_symptom_trend": {
        const days = defaultDays(input.days_back, 60);
        return await getSymptomTrend(input.area_id as string, days);
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { error: msg };
  }
}
