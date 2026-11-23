"use server";

import { supabase } from "@/db";
import { todayLocal } from "@/lib/dates";
import { revalidatePath } from "next/cache";
import { nextFreeBlock } from "@/lib/groups";

export async function createTemplate(name: string, category?: string | null) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Template name is required");

  const { data, error } = await supabase
    .from("templates")
    .insert({ name: trimmed, category: category?.trim() || null })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/templates");
  return data;
}

export async function listTemplates() {
  const { data, error } = await supabase
    .from("templates")
    .select(
      "*, template_exercises(position, target_sets, target_reps, exercises(id, name))"
    )
    .order("name");

  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const texs = ((t.template_exercises as any[]) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((te) => ({
        name: te.exercises?.name as string,
        targetSets: (te.target_sets as number | null) ?? null,
        targetReps: (te.target_reps as string | null) ?? null,
      }))
      .filter((e) => e.name);
    return {
      id: t.id as string,
      name: t.name as string,
      category: (t.category as string | null) ?? null,
      exerciseCount: texs.length,
      exercises: texs,
    };
  });
}

export async function getTemplate(id: string) {
  const { data: template, error } = await supabase
    .from("templates")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !template) return null;

  const q = (select: string) =>
    supabase
      .from("template_exercises")
      .select(select as "*")
      .eq("template_id", id)
      .order("position");
  // Retry without the equipment embed while migration 0017 is unapplied.
  let { data: tex } = await q("*, exercises(*, equipment(id, name, bar_weight))");
  if (!tex) ({ data: tex } = await q("*, exercises(*)"));

  return {
    id: template.id as string,
    name: template.name as string,
    category: (template.category as string | null) ?? null,
    prescription_notes: (template.prescription_notes as string | null) ?? null,
    exercises: (tex ?? []).map((row) => ({
      templateExerciseId: row.id as string,
      position: row.position as number,
      targetSets: (row.target_sets as number | null) ?? null,
      targetReps: (row.target_reps as string | null) ?? null,
      // Grouping + timers (migration 0019). Undefined before it runs → null.
      block: (row.block as number | null | undefined) ?? null,
      restSeconds: (row.rest_seconds as number | null | undefined) ?? null,
      timedSeconds: (row.timed_seconds as number | null | undefined) ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exercise: (row as any).exercises,
    })),
  };
}

export async function updateTemplate(
  id: string,
  data: { name?: string; category?: string | null; prescription_notes?: string | null }
) {
  const update: Record<string, unknown> = {};
  if (data.prescription_notes !== undefined) {
    // Empty / whitespace-only clears the notes card entirely.
    update.prescription_notes = data.prescription_notes?.trim() || null;
  }
  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) throw new Error("Template name is required");
    update.name = trimmed;
  }
  if (data.category !== undefined) {
    update.category = data.category?.trim() || null;
  }

  const { error } = await supabase.from("templates").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/templates");
  revalidatePath(`/templates/${id}`);
}

export async function deleteTemplate(id: string) {
  const { error } = await supabase.from("templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/templates");
}

export async function addExerciseToTemplate(
  templateId: string,
  exerciseId: string
) {
  // Get next position
  const { data: existing } = await supabase
    .from("template_exercises")
    .select("position")
    .eq("template_id", templateId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = (existing?.[0]?.position ?? 0) + 1;

  const { error } = await supabase.from("template_exercises").insert({
    template_id: templateId,
    exercise_id: exerciseId,
    position: nextPosition,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/templates/${templateId}`);
}

export async function updateTemplateExerciseTargets(
  templateExerciseId: string,
  targetSets: number | null,
  targetReps: string | null
) {
  const update: Record<string, unknown> = {
    target_sets: targetSets,
    target_reps: targetReps?.trim() || null,
  };
  const { data, error } = await supabase
    .from("template_exercises")
    .update(update)
    .eq("id", templateExerciseId)
    .select("template_id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/");
  if (data?.template_id) revalidatePath(`/templates/${data.template_id}`);
}

export async function moveTemplateExercise(
  templateExerciseId: string,
  direction: "up" | "down"
) {
  // Get the current entry
  const { data: current, error: currentError } = await supabase
    .from("template_exercises")
    .select("*")
    .eq("id", templateExerciseId)
    .single();

  if (currentError || !current) throw new Error("Entry not found");

  // Find the neighbor in the requested direction
  const isUp = direction === "up";
  let query = supabase
    .from("template_exercises")
    .select("*")
    .eq("template_id", current.template_id);

  if (isUp) {
    query = query.lt("position", current.position).order("position", { ascending: false });
  } else {
    query = query.gt("position", current.position).order("position", { ascending: true });
  }

  const { data: neighbors } = await query.limit(1);
  const neighbor = neighbors?.[0];
  if (!neighbor) return; // already at end

  // Swap positions — use a temporary value to avoid any potential unique conflicts
  const TEMP = -1 - Math.floor(Math.random() * 1000000);
  await supabase
    .from("template_exercises")
    .update({ position: TEMP })
    .eq("id", current.id);
  await supabase
    .from("template_exercises")
    .update({ position: current.position })
    .eq("id", neighbor.id);
  await supabase
    .from("template_exercises")
    .update({ position: neighbor.position })
    .eq("id", current.id);

  // A group is defined by adjacency, so a move can strand a block member
  // (or leave a block with a single row). Clear those memberships.
  await normalizeBlocks(current.template_id as string);

  revalidatePath(`/templates/${current.template_id}`);
}

/**
 * Move a template exercise to an explicit 1-based slot (typed into the
 * row's number field). Everything else shifts to make room; positions are
 * renumbered 1..n so the list stays dense.
 */
export async function moveTemplateExerciseToPosition(
  templateExerciseId: string,
  newIndex: number
) {
  const { data: current, error } = await supabase
    .from("template_exercises")
    .select("id, template_id")
    .eq("id", templateExerciseId)
    .single();
  if (error || !current) throw new Error("Entry not found");
  const templateId = current.template_id as string;

  const { data, error: listErr } = await supabase
    .from("template_exercises")
    .select("id, position")
    .eq("template_id", templateId)
    .order("position");
  if (listErr) throw new Error(listErr.message);
  const rows = (data ?? []) as { id: string; position: number }[];

  const from = rows.findIndex((r) => r.id === current.id);
  if (from < 0) return;
  const to = Math.max(0, Math.min(rows.length - 1, Math.round(newIndex) - 1));
  if (!Number.isFinite(to) || to === from) return;

  const reordered = [...rows];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);

  // Only touch rows whose slot actually changed. No unique index on
  // position, so a direct renumber is safe.
  const writes = reordered
    .map((r, i) => ({ id: r.id, position: i + 1 }))
    .filter((w) => rows.find((r) => r.id === w.id)!.position !== w.position)
    .map((w) =>
      supabase.from("template_exercises").update({ position: w.position }).eq("id", w.id)
    );
  for (const r of await Promise.all(writes)) {
    if (r.error) throw new Error(r.error.message);
  }

  await normalizeBlocks(templateId);
  revalidatePath(`/templates/${templateId}`);
  revalidatePath("/");
}

type BlockRow = { id: string; position: number; block: number | null };

/** Rows of a template ordered by position, with block (null pre-migration). */
async function loadBlockRows(templateId: string): Promise<BlockRow[]> {
  const { data, error } = await supabase
    .from("template_exercises")
    .select("id, position, block")
    .eq("template_id", templateId)
    .order("position");
  if (error) {
    // Column missing → migration 0019 not applied yet. Treat as no blocks.
    if (error.code === "42703" || error.code === "PGRST204") return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    position: r.position as number,
    block: (r.block as number | null) ?? null,
  }));
}

function migrationHint(message: string): Error {
  if (/block|rest_seconds|timed_seconds/.test(message) && /column|schema/i.test(message)) {
    return new Error(
      "Groups and timers need migration 0019 (drizzle/0019_exercise_groups.sql) — run it in the Supabase SQL editor first."
    );
  }
  return new Error(message);
}

/**
 * Drop block membership from any row whose neighbours don't share its block
 * (so no block ever has a single member and blocks are always contiguous).
 */
async function normalizeBlocks(templateId: string) {
  const rows = await loadBlockRows(templateId);
  const toClear: string[] = [];
  rows.forEach((r, i) => {
    if (r.block == null) return;
    const prev = rows[i - 1];
    const next = rows[i + 1];
    const linked =
      (prev && prev.block === r.block) || (next && next.block === r.block);
    if (!linked) toClear.push(r.id);
  });
  if (toClear.length > 0) {
    const { error } = await supabase
      .from("template_exercises")
      .update({ block: null })
      .in("id", toClear);
    if (error) throw migrationHint(error.message);
  }
}

/**
 * Link a template exercise with the one directly BELOW it (next position),
 * forming or extending a superset / tri-set / giant set. Joining two existing
 * blocks merges them.
 */
export async function linkTemplateExerciseWithNext(templateExerciseId: string) {
  const { data: current, error } = await supabase
    .from("template_exercises")
    .select("id, template_id, position")
    .eq("id", templateExerciseId)
    .single();
  if (error || !current) throw new Error("Entry not found");
  const templateId = current.template_id as string;

  const rows = await loadBlockRows(templateId);
  const idx = rows.findIndex((r) => r.id === current.id);
  if (idx < 0 || idx === rows.length - 1) return; // nothing below to link to
  const me = rows[idx];
  const below = rows[idx + 1];

  const target = me.block ?? below.block ?? nextFreeBlock(rows);
  const ids = new Set<string>([me.id, below.id]);
  // Merge: every contiguous member of either existing block joins `target`.
  for (let i = idx - 1; i >= 0 && me.block != null && rows[i].block === me.block; i--) ids.add(rows[i].id);
  for (let i = idx + 2; i < rows.length && below.block != null && rows[i].block === below.block; i++) ids.add(rows[i].id);

  const { error: upErr } = await supabase
    .from("template_exercises")
    .update({ block: target })
    .in("id", Array.from(ids));
  if (upErr) throw migrationHint(upErr.message);

  revalidatePath(`/templates/${templateId}`);
  revalidatePath("/");
}

/**
 * Split the block between a template exercise and the one directly below it.
 * Whichever side is left with a single row becomes a solo exercise again.
 */
export async function unlinkTemplateExerciseFromNext(templateExerciseId: string) {
  const { data: current, error } = await supabase
    .from("template_exercises")
    .select("id, template_id")
    .eq("id", templateExerciseId)
    .single();
  if (error || !current) throw new Error("Entry not found");
  const templateId = current.template_id as string;

  const rows = await loadBlockRows(templateId);
  const idx = rows.findIndex((r) => r.id === current.id);
  if (idx < 0 || idx === rows.length - 1) return;
  const me = rows[idx];
  const below = rows[idx + 1];
  if (me.block == null || me.block !== below.block) return; // not linked

  // Tail = below and everything after it in the same block.
  const tail: string[] = [];
  for (let i = idx + 1; i < rows.length && rows[i].block === me.block; i++) tail.push(rows[i].id);
  // Head = me and everything before in the same block.
  const head: string[] = [];
  for (let i = idx; i >= 0 && rows[i].block === me.block; i--) head.push(rows[i].id);

  const tailBlock = tail.length >= 2 ? nextFreeBlock(rows) : null;
  const results = await Promise.all([
    supabase.from("template_exercises").update({ block: tailBlock }).in("id", tail),
    head.length < 2
      ? supabase.from("template_exercises").update({ block: null }).in("id", head)
      : Promise.resolve({ error: null }),
  ]);
  for (const r of results) {
    if (r.error) throw migrationHint(r.error.message);
  }

  revalidatePath(`/templates/${templateId}`);
  revalidatePath("/");
}

/** Rest after a set (seconds) and timed-set duration (seconds); null clears. */
export async function updateTemplateExerciseTiming(
  templateExerciseId: string,
  restSeconds: number | null,
  timedSeconds: number | null
) {
  const clean = (v: number | null, max: number) =>
    v == null || !Number.isFinite(v) || v <= 0 ? null : Math.min(max, Math.round(v));
  const { data, error } = await supabase
    .from("template_exercises")
    .update({ rest_seconds: clean(restSeconds, 3600), timed_seconds: clean(timedSeconds, 7200) })
    .eq("id", templateExerciseId)
    .select("template_id")
    .single();
  if (error) throw migrationHint(error.message);

  revalidatePath("/");
  if (data?.template_id) revalidatePath(`/templates/${data.template_id}`);
}

export async function removeExerciseFromTemplate(templateExerciseId: string) {
  const { data, error } = await supabase
    .from("template_exercises")
    .delete()
    .eq("id", templateExerciseId)
    .select("template_id");

  if (error) throw new Error(error.message);
  // Removing a superset partner can leave a one-row block behind.
  const templateId = data?.[0]?.template_id as string | undefined;
  if (templateId) await normalizeBlocks(templateId);
  revalidatePath("/templates");
  if (templateId) revalidatePath(`/templates/${templateId}`);
}

export async function startWorkoutFromTemplate(templateId: string) {
  const today = todayLocal();

  // Check if a workout already exists for today
  const { data: existing } = await supabase
    .from("workouts")
    .select("*")
    .eq("performed_on", today)
    .single();

  if (existing) {
    // Update existing workout with template_id (if it doesn't have one)
    if (!existing.template_id) {
      await supabase
        .from("workouts")
        .update({ template_id: templateId })
        .eq("id", existing.id);
    }
    revalidatePath("/");
    return existing;
  }

  // Create new workout with template_id
  const { data, error } = await supabase
    .from("workouts")
    .insert({ performed_on: today, template_id: templateId })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/");
  return data;
}
