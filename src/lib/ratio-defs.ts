import { type StandardLift } from "@/lib/strength-standards";

// Healthy strength-ratio targets. Sources: standard strength-coaching guidelines
// (Greg Nuckols, Mike Israetel, Eric Cressey). Values are rough — used as
// "near target" vs "off" indicators, not surgical thresholds.
export type RatioDef = {
  id: string;
  label: string;
  description: string;
  numerator: StandardLift[];
  denominator: StandardLift[];
  targetMin: number;
  targetMax: number;
  hint: string;
};

export const RATIO_DEFS: RatioDef[] = [
  {
    id: "press_pull",
    label: "Press : Pull",
    description: "Horizontal balance — chest vs upper back",
    numerator: ["bench_press", "db_bench_press", "incline_bench"],
    denominator: ["bent_over_row", "chest_supported_row"],
    targetMin: 0.95,
    targetMax: 1.10,
    hint: "Strong imbalance toward press = shoulder-injury risk. Rebalance with more rowing.",
  },
  {
    id: "ohp_bench",
    label: "OHP : Bench",
    description: "Vertical-press strength vs horizontal",
    numerator: ["overhead_press", "db_shoulder_press"],
    denominator: ["bench_press", "db_bench_press"],
    targetMin: 0.60,
    targetMax: 0.75,
    hint: "Low OHP vs bench is the most common asymmetry — add dedicated vertical pressing.",
  },
  {
    id: "squat_dl",
    label: "Squat : Deadlift",
    description: "Quad-dominant vs hip-dominant strength",
    numerator: ["squat", "front_squat", "zercher_squat"],
    denominator: ["deadlift", "romanian_deadlift"],
    targetMin: 0.78,
    targetMax: 0.92,
    hint: "Squat much lower than DL = quads may be limiting. Vice versa = posterior chain weakness.",
  },
  {
    id: "rdl_squat",
    label: "RDL : Squat",
    description: "Posterior chain vs quad strength",
    numerator: ["romanian_deadlift"],
    denominator: ["squat", "front_squat", "zercher_squat"],
    targetMin: 0.85,
    targetMax: 1.10,
    hint: "RDL much lower than squat indicates posterior-chain weakness — common back-injury precursor.",
  },
  {
    id: "pull_press",
    label: "Pull-up : Press",
    description: "Vertical pull vs vertical press",
    numerator: ["pull_up", "chin_up"],
    denominator: ["overhead_press", "db_shoulder_press"],
    targetMin: 1.20,
    targetMax: 1.60,
    hint: "Pull-up should exceed OHP by ~25-50% (BW counts in pull-ups).",
  },
];
