"use server";

import { supabase } from "@/db";
import { revalidatePath } from "next/cache";

export type LiftGoal = {
  id: string;
  exercise_id: string;
  target_e1rm: number;
  target_date: string | null;
  note: string | null;
  achieved_on: string | null;
  created_at: string;
};

export type LiftGoalWithExercise = LiftGoal & {
  exercise: { id: string; name: string; body_part: string | null };
};

// The lift_goals migration (0007) hasn't been applied yet. Until then, reads
// degrade to "no goals" instead of 500ing. Covers both Postgres' native error
// (42P01 / "relation ... does not exist") and PostgREST's schema-cache error
// (PGRST205 / "Could not find the table ... in the schema cache").
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = error.message ?? "";
  return /lift_goals/.test(msg) && /(does not exist|could not find the table)/i.test(msg);
}

export async function listGoals(): Promise<LiftGoalWithExercise[]> {
  const { data, error } = await supabase
    .from("lift_goals")
    .select("*, exercise:exercises(id, name, body_part)")
    .order("created_at");
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any;
}

export async function getGoalForExercise(
  exerciseId: string,
): Promise<LiftGoal | null> {
  const { data, error } = await supabase
    .from("lift_goals")
    .select("*")
    .eq("exercise_id", exerciseId)
    .maybeSingle();
  if (error && !isMissingTable(error)) throw new Error(error.message);
  return (data as LiftGoal) ?? null;
}

/**
 * Create or update the goal for an exercise (one goal per exercise). Setting a
 * goal clears any prior "achieved" marker so the new target is live.
 */
export async function setGoal(
  exerciseId: string,
  targetE1rm: number,
  targetDate?: string | null,
  note?: string | null,
) {
  if (targetE1rm <= 0) throw new Error("Target must be positive");

  const { data: existing } = await supabase
    .from("lift_goals")
    .select("id")
    .eq("exercise_id", exerciseId)
    .maybeSingle();

  const payload = {
    target_e1rm: targetE1rm,
    target_date: targetDate || null,
    note: note?.trim() || null,
    achieved_on: null,
  };

  if (existing) {
    const { error } = await supabase
      .from("lift_goals")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("lift_goals")
      .insert({ exercise_id: exerciseId, ...payload });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/eta");
  revalidatePath("/goals");
  revalidatePath(`/exercises/${exerciseId}`);
}

export async function removeGoal(exerciseId: string) {
  const { error } = await supabase
    .from("lift_goals")
    .delete()
    .eq("exercise_id", exerciseId);
  if (error) throw new Error(error.message);
  revalidatePath("/eta");
  revalidatePath("/goals");
  revalidatePath(`/exercises/${exerciseId}`);
}
