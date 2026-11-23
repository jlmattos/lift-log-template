// StrengthLevel-derived tier thresholds expressed as e1RM ÷ bodyweight ratios.
// These are approximate mid-range values; real StrengthLevel data varies by bodyweight,
// but these capture the spirit of their tier system.

export type Tier = "beginner" | "novice" | "intermediate" | "advanced" | "elite";

export type StandardLift =
  | "bench_press"
  | "squat"
  | "deadlift"
  | "overhead_press"
  | "bent_over_row"
  | "pull_up"
  | "chin_up"
  | "dip"
  | "front_squat"
  | "zercher_squat"
  | "incline_bench"
  | "romanian_deadlift"
  | "barbell_curl"
  | "hip_thrust"
  | "db_bench_press"
  | "db_bulgarian_split_squat"
  | "chest_supported_row"
  | "db_shoulder_press";

type Thresholds = {
  beginner: number;
  novice: number;
  intermediate: number;
  advanced: number;
  elite: number;
};

// e1RM / bodyweight ratios — sourced from real StrengthLevel published standards.
// Barbell lifts use their headline simple ratios. Bodyweight lifts (pull-up,
// chin-up, dip) use per-BW table interpolation at common reference bodyweights
// (~165 lb male / ~135 lb female) since their simple ratios are bodyweight-sensitive.
const MALE_RATIOS: Record<StandardLift, Thresholds> = {
  bench_press:       { beginner: 0.50, novice: 0.75, intermediate: 1.25, advanced: 1.75, elite: 2.00 },
  squat:             { beginner: 0.75, novice: 1.25, intermediate: 1.50, advanced: 2.25, elite: 2.75 },
  deadlift:          { beginner: 1.00, novice: 1.50, intermediate: 2.00, advanced: 2.50, elite: 3.00 },
  overhead_press:    { beginner: 0.35, novice: 0.55, intermediate: 0.80, advanced: 1.10, elite: 1.40 },
  bent_over_row:     { beginner: 0.50, novice: 0.75, intermediate: 1.00, advanced: 1.50, elite: 1.75 },
  pull_up:           { beginner: 0.91, novice: 1.16, intermediate: 1.45, advanced: 1.77, elite: 2.11 }, // total = BW + added; @ ~165 lb male
  chin_up:           { beginner: 0.96, novice: 1.18, intermediate: 1.45, advanced: 1.74, elite: 2.04 },
  dip:               { beginner: 0.98, novice: 1.28, intermediate: 1.65, advanced: 2.06, elite: 2.49 },
  front_squat:       { beginner: 0.75, novice: 1.00, intermediate: 1.25, advanced: 1.75, elite: 2.25 },
  zercher_squat:     { beginner: 0.50, novice: 1.00, intermediate: 1.50, advanced: 2.00, elite: 2.50 },
  incline_bench:     { beginner: 0.50, novice: 0.75, intermediate: 1.00, advanced: 1.50, elite: 1.75 },
  romanian_deadlift: { beginner: 0.75, novice: 1.00, intermediate: 1.50, advanced: 2.00, elite: 2.75 },
  barbell_curl:      { beginner: 0.20, novice: 0.40, intermediate: 0.60, advanced: 0.85, elite: 1.15 },
  hip_thrust:        { beginner: 0.50, novice: 1.00, intermediate: 1.75, advanced: 2.50, elite: 3.50 },
  // Dumbbell lifts — per-dumbbell ratios sourced from real StrengthLevel
  // published standards at 165 lb male reference (closest to common BW).
  db_bench_press:           { beginner: 0.22, novice: 0.36, intermediate: 0.54, advanced: 0.75, elite: 0.99 },
  db_bulgarian_split_squat: { beginner: 0.14, novice: 0.25, intermediate: 0.41, advanced: 0.60, elite: 0.80 },
  chest_supported_row:      { beginner: 0.12, novice: 0.27, intermediate: 0.48, advanced: 0.75, elite: 1.08 },
  db_shoulder_press:        { beginner: 0.18, novice: 0.29, intermediate: 0.42, advanced: 0.58, elite: 0.75 },
};

const FEMALE_RATIOS: Record<StandardLift, Thresholds> = {
  bench_press:       { beginner: 0.25, novice: 0.50, intermediate: 0.75, advanced: 1.00, elite: 1.50 },
  squat:             { beginner: 0.50, novice: 0.75, intermediate: 1.25, advanced: 1.50, elite: 2.00 },
  deadlift:          { beginner: 0.50, novice: 1.00, intermediate: 1.25, advanced: 1.75, elite: 2.50 },
  overhead_press:    { beginner: 0.20, novice: 0.35, intermediate: 0.50, advanced: 0.75, elite: 1.00 },
  bent_over_row:     { beginner: 0.25, novice: 0.40, intermediate: 0.65, advanced: 0.90, elite: 1.20 },
  pull_up:           { beginner: 0.72, novice: 0.92, intermediate: 1.16, advanced: 1.42, elite: 1.70 },
  chin_up:           { beginner: 0.94, novice: 1.19, intermediate: 1.48, advanced: 1.80, elite: 2.14 },
  dip:               { beginner: 0.92, novice: 1.26, intermediate: 1.66, advanced: 2.11, elite: 2.59 },
  front_squat:       { beginner: 0.50, novice: 0.75, intermediate: 1.00, advanced: 1.25, elite: 1.50 },
  zercher_squat:     { beginner: 0.25, novice: 0.50, intermediate: 1.00, advanced: 1.50, elite: 1.75 },
  incline_bench:     { beginner: 0.20, novice: 0.40, intermediate: 0.65, advanced: 1.00, elite: 1.40 },
  romanian_deadlift: { beginner: 0.50, novice: 0.75, intermediate: 1.00, advanced: 1.50, elite: 1.75 },
  barbell_curl:      { beginner: 0.10, novice: 0.20, intermediate: 0.40, advanced: 0.60, elite: 0.85 },
  hip_thrust:        { beginner: 0.50, novice: 1.00, intermediate: 1.50, advanced: 2.25, elite: 3.00 },
  // Per-dumbbell ratios sourced from real StrengthLevel at 150 lb female reference.
  db_bench_press:           { beginner: 0.09, novice: 0.19, intermediate: 0.32, advanced: 0.48, elite: 0.67 },
  db_bulgarian_split_squat: { beginner: 0.09, novice: 0.17, intermediate: 0.27, advanced: 0.41, elite: 0.55 },
  chest_supported_row:      { beginner: 0.11, novice: 0.20, intermediate: 0.32, advanced: 0.47, elite: 0.63 },
  db_shoulder_press:        { beginner: 0.09, novice: 0.15, intermediate: 0.24, advanced: 0.34, elite: 0.45 },
};

// Some lifts (pull-up, chin-up, dip) use TOTAL weight = bodyweight + added weight
export const ADD_BODYWEIGHT_LIFTS: StandardLift[] = ["pull_up", "chin_up", "dip"];

export const STANDARD_LIFT_LABELS: Record<StandardLift, string> = {
  bench_press: "Bench Press",
  squat: "Back Squat",
  deadlift: "Deadlift",
  overhead_press: "Overhead Press",
  bent_over_row: "Bent Over Row",
  pull_up: "Pull-Up",
  chin_up: "Chin-Up",
  dip: "Dip",
  front_squat: "Front Squat",
  zercher_squat: "Zercher Squat",
  incline_bench: "Incline Bench Press",
  romanian_deadlift: "Romanian Deadlift",
  barbell_curl: "Barbell Curl",
  hip_thrust: "Hip Thrust",
  db_bench_press: "DB Bench Press (per dumbbell)",
  db_bulgarian_split_squat: "DB Bulgarian Split Squat (per dumbbell)",
  chest_supported_row: "Chest Supported Row (per dumbbell)",
  db_shoulder_press: "DB Shoulder Press (per dumbbell)",
};

export function getThresholds(lift: StandardLift, sex: "male" | "female"): Thresholds {
  return sex === "female" ? FEMALE_RATIOS[lift] : MALE_RATIOS[lift];
}

/**
 * Compute tier for a given e1RM at bodyweight.
 * Returns the tier achieved + the threshold to reach next tier (in ratio).
 */
export function computeTier(
  lift: StandardLift,
  sex: "male" | "female",
  e1rm: number,
  bodyweight: number
): {
  ratio: number;
  tier: Tier;
  nextTier: Tier | null;
  thresholdToNext: number | null; // e1RM in lbs needed
  pctToNext: number; // 0-100, position within current tier
} {
  const t = getThresholds(lift, sex);
  // For pull-up/chin-up/dip the "ratio" should include bodyweight in the e1RM
  // — but the caller is responsible for adjusting e1rm before calling.
  const ratio = bodyweight > 0 ? e1rm / bodyweight : 0;

  let tier: Tier;
  let nextRatio: number | null;
  let prevRatio: number;
  if (ratio >= t.elite) {
    tier = "elite"; nextRatio = null; prevRatio = t.elite;
  } else if (ratio >= t.advanced) {
    tier = "advanced"; nextRatio = t.elite; prevRatio = t.advanced;
  } else if (ratio >= t.intermediate) {
    tier = "intermediate"; nextRatio = t.advanced; prevRatio = t.intermediate;
  } else if (ratio >= t.novice) {
    tier = "novice"; nextRatio = t.intermediate; prevRatio = t.novice;
  } else if (ratio >= t.beginner) {
    tier = "beginner"; nextRatio = t.novice; prevRatio = t.beginner;
  } else {
    tier = "beginner"; nextRatio = t.beginner; prevRatio = 0;
  }

  const pctToNext = nextRatio
    ? Math.min(100, Math.max(0, ((ratio - prevRatio) / (nextRatio - prevRatio)) * 100))
    : 100;

  const thresholdToNext = nextRatio ? nextRatio * bodyweight : null;
  const nextTier: Tier | null =
    tier === "beginner" ? (ratio >= t.beginner ? "novice" : "beginner") :
    tier === "novice" ? "intermediate" :
    tier === "intermediate" ? "advanced" :
    tier === "advanced" ? "elite" :
    null;

  return { ratio, tier, nextTier, thresholdToNext, pctToNext };
}

export const TIER_COLORS: Record<Tier, { bg: string; border: string; text: string; label: string }> = {
  beginner:     { bg: "bg-slate-500/15",   border: "border-slate-500",   text: "text-slate-300",   label: "Beginner" },
  novice:       { bg: "bg-blue-500/15",    border: "border-blue-500",    text: "text-blue-300",    label: "Novice" },
  intermediate: { bg: "bg-emerald-500/15", border: "border-emerald-500", text: "text-emerald-300", label: "Intermediate" },
  advanced:     { bg: "bg-amber-500/15",   border: "border-amber-500",   text: "text-amber-300",   label: "Advanced" },
  elite:        { bg: "bg-fuchsia-500/15", border: "border-fuchsia-500", text: "text-fuchsia-300", label: "Elite" },
};
