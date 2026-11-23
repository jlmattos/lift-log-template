"use server";

import { supabase } from "@/db";
import { revalidatePath } from "next/cache";

export type MetricDef = {
  key: string;
  label: string;
  type: "number" | "boolean" | "text" | "enum";
  unit?: string;
  range?: [number, number];
  default?: number | string | boolean;
  options?: string[];
  required?: boolean;
};

export type CardioTemplate = {
  id: string;
  name: string;
  type: string;
  prescription_notes: string | null;
  tracked_metrics: MetricDef[];
  strava_match_type: string | null;
  created_at: string;
  // Two-axis model (nullable for legacy modality-locked templates):
  // `protocol` is the "what" (vo2, zone_2…); `allowed_modalities` lists the
  // "how" options the user picks at log time. When null, the template behaves
  // like before (single fixed modality from `type`).
  protocol?: string | null;
  allowed_modalities?: string[] | null;
};

export async function listCardioTemplates(): Promise<CardioTemplate[]> {
  const { data } = await supabase.from("cardio_templates").select("*").order("name");
  return (data ?? []) as CardioTemplate[];
}

export async function getCardioTemplate(id: string): Promise<CardioTemplate | null> {
  const { data } = await supabase.from("cardio_templates").select("*").eq("id", id).maybeSingle();
  return (data as CardioTemplate) ?? null;
}

/**
 * Strict Strava match: same calendar date AND same activity type.
 * Returns the most recent matching cardio_session if one exists, else null.
 * Used to pre-fill the log form.
 */
export async function findMatchingStravaSession(
  templateId: string,
  date: string,
  // For two-axis templates the Strava type comes from the modality the user
  // picked, not the template. When omitted, falls back to the template's own
  // strava_match_type (legacy modality-locked templates).
  stravaMatchTypeOverride?: string | null,
): Promise<{
  id: string;
  performed_on: string;
  duration_min: number;
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_watts: number | null;
  name: string | null;
} | null> {
  const tpl = await getCardioTemplate(templateId);
  const matchType = stravaMatchTypeOverride ?? tpl?.strava_match_type;
  if (!matchType) return null;

  // Map Strava type → our normalized cardio type
  const TYPE_MAP: Record<string, string> = {
    Ride: "ride", VirtualRide: "ride", EBikeRide: "ride",
    Run: "run", TrailRun: "run", VirtualRun: "run",
    Rowing: "row",
    Hike: "hike",
    Walk: "walk",
  };
  const ourType = TYPE_MAP[matchType];
  if (!ourType) return null;

  const { data } = await supabase
    .from("cardio_sessions")
    .select("id, performed_on, duration_min, distance_m, avg_hr, max_hr, avg_watts, name")
    .in("source", ["strava", "intervals"])
    .eq("performed_on", date)
    .eq("type", ourType)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * Save a cardio log: either updates a matched Strava session by adding
 * cardio_template_id + manual_metrics, OR inserts a new manual session.
 */
export async function logCardioSession(input: {
  templateId: string;
  date: string;
  manualMetrics: Record<string, unknown>;
  matchedStravaSessionId?: string | null;
  // Fallback for when no Strava match: minimal derived fields the user provides
  fallbackType?: string;
  fallbackDurationMin?: number;
  // Two-axis model: protocol (what) from the template, modality (how) picked at
  // log time. modalitySessionType is the cardio_sessions.type the modality maps to.
  protocol?: string | null;
  modality?: string | null;
  modalitySessionType?: string | null;
}) {
  const tpl = await getCardioTemplate(input.templateId);
  if (!tpl) throw new Error("Template not found");

  // Protocol resolves from the template (falls back to its legacy `type`).
  const protocol = input.protocol ?? tpl.protocol ?? null;

  if (input.matchedStravaSessionId) {
    // Attach template + manual metrics to the existing Strava session. Also
    // stamp protocol/modality so two-axis slicing works on Strava-sourced rows.
    const { error } = await supabase
      .from("cardio_sessions")
      .update({
        cardio_template_id: input.templateId,
        manual_metrics: input.manualMetrics,
        protocol,
        modality: input.modality ?? null,
      })
      .eq("id", input.matchedStravaSessionId);
    if (error) throw new Error(error.message);
  } else {
    // Create a new manual session. Session type comes from the picked modality
    // (two-axis), else the explicit fallback, else the legacy template map.
    const TYPE_MAP: Record<string, string> = {
      ruck: "hike", vo2_bike: "ride", vo2_rower: "row",
      rower_sprints: "row", shred_shed: "other", zone_2: "other",
      z2_hiit: "other",
    };
    const sessionType =
      input.modalitySessionType ?? input.fallbackType ?? TYPE_MAP[tpl.type] ?? "other";
    const { error } = await supabase.from("cardio_sessions").insert({
      source: "manual",
      cardio_template_id: input.templateId,
      performed_on: input.date,
      type: sessionType,
      protocol,
      modality: input.modality ?? null,
      name: tpl.name,
      duration_min: input.fallbackDurationMin ?? 0,
      manual_metrics: input.manualMetrics,
      estimated_load: 0,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/cardio");
  revalidatePath("/chat");
}
