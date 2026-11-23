"use server";

import { supabase } from "@/db";
import { fetchAllRows } from "@/lib/paginate";
import { todayLocal } from "@/lib/dates";
import { revalidatePath } from "next/cache";

export type InjuryStatus = "active" | "rehabbing" | "managing" | "resolved";

export type InjuryArea = {
  id: string;
  name: string;
  description: string | null;
  related_body_parts: string[];
  status: InjuryStatus;
  training_modifications: string | null;
  started_on: string | null;
};

export type SymptomCheckin = {
  id: string;
  checked_on: string;
  area_id: string;
  severity: number;
  affected_sleep: boolean;
  affected_workout: boolean;
  notes: string | null;
};

export async function listInjuryAreas(): Promise<InjuryArea[]> {
  const { data, error } = await supabase
    .from("injury_areas")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as InjuryArea[];
}

export async function createInjuryArea(
  name: string,
  description?: string,
  relatedBodyParts?: string[],
  status?: InjuryStatus,
  trainingModifications?: string | null,
  startedOn?: string | null,
) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Area name is required");

  const { data, error } = await supabase
    .from("injury_areas")
    .insert({
      name: trimmed,
      description: description?.trim() || null,
      related_body_parts: relatedBodyParts ?? [],
      status: status ?? "active",
      training_modifications: trainingModifications?.trim() || null,
      started_on: startedOn || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/wellness");
  revalidatePath("/profile");
  return data;
}

export async function updateInjuryArea(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    relatedBodyParts?: string[];
    status?: InjuryStatus;
    trainingModifications?: string | null;
    startedOn?: string | null;
  }
) {
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) throw new Error("Area name is required");
    update.name = trimmed;
  }
  if (data.description !== undefined) {
    update.description = data.description?.trim() || null;
  }
  if (data.relatedBodyParts !== undefined) {
    update.related_body_parts = data.relatedBodyParts;
  }
  if (data.status !== undefined) {
    update.status = data.status;
  }
  if (data.trainingModifications !== undefined) {
    update.training_modifications = data.trainingModifications?.trim() || null;
  }
  if (data.startedOn !== undefined) {
    update.started_on = data.startedOn || null;
  }

  const { error } = await supabase
    .from("injury_areas")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/wellness");
  revalidatePath("/profile");
}

export async function deleteInjuryArea(id: string) {
  const { error } = await supabase.from("injury_areas").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/wellness");
}

/**
 * Get today's checkins (or for a specific date) for all areas.
 * Returns a map area_id → checkin (or undefined if not yet logged).
 */
export async function getCheckinsForDate(date?: string) {
  const d = date ?? todayLocal();

  const [areasResult, checkinsResult] = await Promise.all([
    supabase.from("injury_areas").select("*").order("name"),
    supabase.from("symptom_checkins").select("*").eq("checked_on", d),
  ]);

  const areas = (areasResult.data ?? []) as InjuryArea[];
  const checkins = (checkinsResult.data ?? []) as SymptomCheckin[];

  return {
    date: d,
    areas,
    checkinsByArea: Object.fromEntries(checkins.map((c) => [c.area_id, c])) as Record<
      string,
      SymptomCheckin
    >,
  };
}

/**
 * Upsert a check-in for a specific area + date.
 */
export async function saveCheckin(
  areaId: string,
  data: {
    severity: number;
    affectedSleep: boolean;
    affectedWorkout: boolean;
    notes?: string | null;
    date?: string;
  }
) {
  if (data.severity < 0 || data.severity > 5) {
    throw new Error("Severity must be 0-5");
  }

  const d = data.date ?? todayLocal();

  // Upsert: delete then insert (avoids ON CONFLICT pain since unique covers the right cols)
  await supabase
    .from("symptom_checkins")
    .delete()
    .eq("checked_on", d)
    .eq("area_id", areaId);

  const { error } = await supabase.from("symptom_checkins").insert({
    checked_on: d,
    area_id: areaId,
    severity: data.severity,
    affected_sleep: data.affectedSleep,
    affected_workout: data.affectedWorkout,
    notes: data.notes?.trim() || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/wellness");
  revalidatePath("/progress");
}

export async function deleteCheckin(date: string, areaId: string) {
  const { error } = await supabase
    .from("symptom_checkins")
    .delete()
    .eq("checked_on", date)
    .eq("area_id", areaId);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/wellness");
  revalidatePath("/progress");
}

/**
 * Get trend data for an injury area: severity over a window, plus workout dates with body parts.
 * Used for the trend chart with workout overlay.
 */
export async function getSymptomTrend(
  areaId: string,
  daysBack: number = 60
): Promise<{
  area: InjuryArea | null;
  days: {
    date: string;
    severity: number | null;
    affectedSleep: boolean;
    affectedWorkout: boolean;
    bodyPartsTrained: string[]; // ["push", "pull", etc.] for that day
    workoutVolume: number;
  }[];
}> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysBack);
  const startStr = start.toISOString().split("T")[0];

  const [areaRes, checkinsRes, sets] = await Promise.all([
    supabase.from("injury_areas").select("*").eq("id", areaId).single(),
    supabase
      .from("symptom_checkins")
      .select("*")
      .eq("area_id", areaId)
      .gte("checked_on", startStr),
    // 60-day set windows pass the 1000-row cap — paginate with stable order.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchAllRows<any>((from, to) =>
      supabase
        .from("sets")
        .select("reps, load, workouts!inner(performed_on), exercises!inner(body_part)")
        .gte("workouts.performed_on", startStr)
        .order("id")
        .range(from, to)
    ),
  ]);

  const area = (areaRes.data as InjuryArea) ?? null;
  const checkins = (checkinsRes.data ?? []) as SymptomCheckin[];

  // Build per-day body part / volume map
  const byDate = new Map<
    string,
    { bodyParts: Set<string>; volume: number }
  >();
  for (const row of sets) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const date = (row as any).workouts.performed_on as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bp = ((row as any).exercises.body_part as string) ?? "other";
    if (!byDate.has(date)) byDate.set(date, { bodyParts: new Set(), volume: 0 });
    const d = byDate.get(date)!;
    d.bodyParts.add(bp);
    d.volume += Number(row.reps) * Number(row.load);
  }

  const checkinByDate = Object.fromEntries(
    checkins.map((c) => [c.checked_on, c])
  ) as Record<string, SymptomCheckin>;

  // Build day-by-day array
  const days: Awaited<ReturnType<typeof getSymptomTrend>>["days"] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i <= daysBack; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d > today) break;
    const ds = d.toISOString().split("T")[0];
    const checkin = checkinByDate[ds];
    const workout = byDate.get(ds);
    days.push({
      date: ds,
      severity: checkin?.severity ?? null,
      affectedSleep: checkin?.affected_sleep ?? false,
      affectedWorkout: checkin?.affected_workout ?? false,
      bodyPartsTrained: workout ? Array.from(workout.bodyParts) : [],
      workoutVolume: workout?.volume ?? 0,
    });
  }

  return { area, days };
}
