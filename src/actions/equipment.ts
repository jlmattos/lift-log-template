"use server";

import { supabase } from "@/db";
import { revalidatePath } from "next/cache";

export type EquipmentRow = {
  id: string;
  name: string;
  bar_weight: number | string;
  created_at: string;
};

// Expected failures come back as values, not throws — Next.js masks thrown
// Server Action messages in production, and these need to reach the UI.
function friendlyError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "A bar with that name already exists";
  return error.message;
}

function validate(name: string, barWeight: number): string | null {
  if (!name.trim()) return "Equipment name is required";
  if (!Number.isFinite(barWeight) || barWeight <= 0) {
    return "Bar weight must be a positive number";
  }
  return null;
}

export async function listEquipment(): Promise<EquipmentRow[]> {
  const { data, error } = await supabase
    .from("equipment")
    .select("*")
    .order("name");
  // PGRST205 / 42P01 = table missing (migration 0017 not yet applied) —
  // degrade to an empty list rather than crashing every page that embeds this.
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function createEquipment(
  name: string,
  barWeight: number
): Promise<{ data?: EquipmentRow; error?: string }> {
  const invalid = validate(name, barWeight);
  if (invalid) return { error: invalid };
  const { data, error } = await supabase
    .from("equipment")
    .insert({ name: name.trim(), bar_weight: barWeight })
    .select()
    .single();
  if (error) return { error: friendlyError(error) };
  revalidatePath("/");
  revalidatePath("/exercises");
  return { data: data as EquipmentRow };
}

export async function updateEquipment(
  id: string,
  data: { name: string; barWeight: number }
): Promise<{ error?: string }> {
  const invalid = validate(data.name, data.barWeight);
  if (invalid) return { error: invalid };
  const { error } = await supabase
    .from("equipment")
    .update({ name: data.name.trim(), bar_weight: data.barWeight })
    .eq("id", id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/");
  revalidatePath("/exercises");
  return {};
}

/** Deletes a bar. Exercises using it fall back to their equipment-type default
 *  (FK is ON DELETE SET NULL). */
export async function deleteEquipment(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from("equipment").delete().eq("id", id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/");
  revalidatePath("/exercises");
  return {};
}
