"use server";

import { supabase } from "@/db";
import { revalidatePath } from "next/cache";

export type UserContext = {
  id: string;
  goals: string | null;
  training_style: string | null;
  notes: string | null;
  updated_at: string;
};

export async function getUserContext(): Promise<UserContext | null> {
  const { data } = await supabase
    .from("user_context")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as UserContext) ?? null;
}

export async function updateUserContext(input: {
  goals?: string | null;
  training_style?: string | null;
  notes?: string | null;
}) {
  // Ensure exactly one row exists, then update it
  const existing = await getUserContext();
  if (!existing) {
    const { error } = await supabase.from("user_context").insert({
      goals: input.goals ?? null,
      training_style: input.training_style ?? null,
      notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message);
  } else {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.goals !== undefined) update.goals = input.goals?.trim() || null;
    if (input.training_style !== undefined) update.training_style = input.training_style?.trim() || null;
    if (input.notes !== undefined) update.notes = input.notes?.trim() || null;
    const { error } = await supabase.from("user_context").update(update).eq("id", existing.id);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/profile");
  revalidatePath("/chat");
}
