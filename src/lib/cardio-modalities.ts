// Cardio modality = the "how" axis of a session (the machine/mode), independent
// of the protocol = the "what" axis (VO2, Zone 2, sprints…). A protocol template
// lists which modalities it allows; the modality is picked per session at log time.
//
// Each modality maps to a Strava activity type (for auto-matching) and carries
// one natural "output" metric appropriate to that mode.

import type { MetricDef } from "@/actions/cardio-templates";

export type ModalityKey = "bike" | "rower" | "run" | "ruck" | "walk" | "other";

export type Modality = {
  key: ModalityKey;
  label: string;
  emoji: string;
  /** The cardio_sessions.type value this modality records. */
  sessionType: string;
  /** Strava activity type used for auto-matching (null = no GPS/Strava match). */
  stravaMatchType: string | null;
  /** The one natural output metric for this modality (null = none beyond duration). */
  outputMetric: MetricDef | null;
};

export const MODALITIES: Modality[] = [
  {
    key: "bike",
    label: "Bike",
    emoji: "🚴",
    sessionType: "ride",
    stravaMatchType: "Ride",
    outputMetric: { key: "avg_watts", label: "Avg watts", type: "number", unit: "W" },
  },
  {
    key: "rower",
    label: "Rower",
    emoji: "🚣",
    sessionType: "row",
    stravaMatchType: "Rowing",
    outputMetric: { key: "avg_split", label: "Avg split", type: "text", unit: "/500m" },
  },
  {
    key: "run",
    label: "Run",
    emoji: "🏃",
    sessionType: "run",
    stravaMatchType: "Run",
    outputMetric: { key: "avg_pace", label: "Avg pace", type: "text", unit: "/mi" },
  },
  {
    key: "ruck",
    label: "Ruck",
    emoji: "🎒",
    sessionType: "hike",
    stravaMatchType: "Hike",
    outputMetric: { key: "pack_weight_lbs", label: "Pack weight", type: "number", unit: "lbs" },
  },
  {
    key: "walk",
    label: "Walk",
    emoji: "🚶",
    sessionType: "walk",
    stravaMatchType: "Walk",
    outputMetric: { key: "distance_mi", label: "Distance", type: "number", unit: "mi" },
  },
  {
    key: "other",
    label: "Other",
    emoji: "💪",
    sessionType: "other",
    stravaMatchType: null,
    outputMetric: null,
  },
];

export function getModality(key: string | null | undefined): Modality | null {
  if (!key) return null;
  return MODALITIES.find((m) => m.key === key) ?? null;
}
