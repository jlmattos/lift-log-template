"use server";

import { supabase } from "@/db";
import { revalidatePath } from "next/cache";

export type EquipmentType =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "other";

// Body part value: muscle group (chest, back, etc.) or legacy category (push/pull/legs).
// All free-text for forwards compat. See src/lib/body-parts.ts for the canonical list.
export type BodyPart = string;

export async function createExercise(
  name: string,
  isUnilateral: boolean,
  equipmentType: EquipmentType = "other",
  bodyPart: BodyPart = "other",
  equipmentId: string | null = null
) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Exercise name is required");

  const { data, error } = await supabase
    .from("exercises")
    .insert({
      name: trimmed,
      is_unilateral: isUnilateral,
      equipment_type: equipmentType,
      body_part: bodyPart,
      // Omit when null so creates still work while migration 0017 (which adds
      // the column) is unapplied — the picker is empty then anyway.
      ...(equipmentId !== null && { equipment_id: equipmentId }),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/exercises");
  return data;
}

// PGRST200 = PostgREST can't resolve the equipment embed because migration
// 0017 hasn't been applied yet. Callers retry without the embed; exercises then
// come back with no `equipment` key, which resolveBar treats as "no bar".
function isMissingEquipmentRel(error: { code?: string } | null): boolean {
  return error?.code === "PGRST200";
}

export async function listExercises(search?: string) {
  const build = (select: string) => {
    let query = supabase.from("exercises").select(select as "*").order("name");
    if (search && search.trim()) {
      query = query.ilike("name", `%${search.trim()}%`);
    }
    return query;
  };

  let { data, error } = await build("*, equipment(id, name, bar_weight)");
  if (isMissingEquipmentRel(error)) {
    ({ data, error } = await build("*"));
  }
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateExercise(
  id: string,
  data: {
    name?: string;
    isUnilateral?: boolean;
    equipmentType?: EquipmentType;
    bodyPart?: BodyPart;
    /** null clears the bar; undefined leaves it untouched. */
    equipmentId?: string | null;
  }
) {
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) throw new Error("Exercise name is required");
    update.name = trimmed;
  }
  if (data.isUnilateral !== undefined) update.is_unilateral = data.isUnilateral;
  if (data.equipmentType !== undefined) update.equipment_type = data.equipmentType;
  if (data.bodyPart !== undefined) update.body_part = data.bodyPart;
  if (data.equipmentId !== undefined) update.equipment_id = data.equipmentId;

  const { error } = await supabase.from("exercises").update(update).eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/exercises");
  revalidatePath(`/exercises/${id}`);
}

export async function deleteExercise(id: string) {
  // Block deletion if exercise has logged sets — preserves history integrity
  const { count: setCount } = await supabase
    .from("sets")
    .select("id", { count: "exact", head: true })
    .eq("exercise_id", id);

  if ((setCount ?? 0) > 0) {
    throw new Error(
      `Cannot delete — this exercise has ${setCount} logged set${setCount !== 1 ? "s" : ""} in your history. Delete those workouts first if you really want to remove it.`
    );
  }

  // Clean up any template references first (no cascade on this FK)
  await supabase.from("template_exercises").delete().eq("exercise_id", id);

  // Now delete the exercise
  const { error } = await supabase.from("exercises").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/exercises");
}

export async function getExercise(id: string) {
  let { data, error } = await supabase
    .from("exercises")
    .select("*, equipment(id, name, bar_weight)")
    .eq("id", id)
    .single();

  if (isMissingEquipmentRel(error)) {
    ({ data, error } = await supabase
      .from("exercises")
      .select("*")
      .eq("id", id)
      .single());
  }
  if (error) return null;
  return data;
}
