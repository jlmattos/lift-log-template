"use server";

import { supabase } from "@/db";
import { revalidatePath } from "next/cache";

export type ExerciseNote = {
  id: string;
  exercise_id: string;
  body: string;
  created_at: string;
};

export async function listExerciseNotes(exerciseId: string): Promise<ExerciseNote[]> {
  const { data, error } = await supabase
    .from("exercise_notes")
    .select("*")
    .eq("exercise_id", exerciseId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ExerciseNote[];
}

export async function addExerciseNote(exerciseId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Note cannot be empty");

  const { error } = await supabase
    .from("exercise_notes")
    .insert({ exercise_id: exerciseId, body: trimmed });

  if (error) throw new Error(error.message);
  revalidatePath(`/exercises/${exerciseId}`);
  revalidatePath(`/log`);
}

export async function deleteExerciseNote(noteId: string, exerciseId: string) {
  const { error } = await supabase
    .from("exercise_notes")
    .delete()
    .eq("id", noteId);

  if (error) throw new Error(error.message);
  revalidatePath(`/exercises/${exerciseId}`);
}
