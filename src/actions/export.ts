"use server";

import { supabase } from "@/db";
import { fetchAllRows } from "@/lib/paginate";

/**
 * Full JSON dump of every table. Use for backups, migration, or programmatic re-import.
 */
export async function generateFullExportJSON() {
  const [
    equipment,
    exercises,
    workouts,
    sets,
    templates,
    template_exercises,
    routines,
    routine_days,
    routine_skips,
    injury_areas,
    symptom_checkins,
    exercise_notes,
  ] = await Promise.all([
    supabase.from("equipment").select("*").order("name"),
    supabase.from("exercises").select("*").order("name"),
    supabase.from("workouts").select("*").order("performed_on"),
    // sets exceeds the 1000-row cap — unpaginated, the "full" export silently
    // held only the oldest ~1000 rows. Wrap to preserve the { data } shape.
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase.from("sets").select("*").order("created_at").order("id").range(from, to)
    ).then((rows) => ({ data: rows })),
    supabase.from("templates").select("*").order("name"),
    supabase.from("template_exercises").select("*"),
    supabase.from("routines").select("*").order("name"),
    supabase.from("routine_days").select("*"),
    supabase.from("routine_skips").select("*"),
    supabase.from("injury_areas").select("*").order("name"),
    supabase.from("symptom_checkins").select("*").order("checked_on"),
    supabase.from("exercise_notes").select("*").order("created_at"),
  ]);

  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      schema_version: 1,
      equipment: equipment.data ?? [],
      exercises: exercises.data ?? [],
      workouts: workouts.data ?? [],
      sets: sets.data ?? [],
      templates: templates.data ?? [],
      template_exercises: template_exercises.data ?? [],
      routines: routines.data ?? [],
      routine_days: routine_days.data ?? [],
      routine_skips: routine_skips.data ?? [],
      injury_areas: injury_areas.data ?? [],
      symptom_checkins: symptom_checkins.data ?? [],
      exercise_notes: exercise_notes.data ?? [],
    },
    null,
    2
  );
}

/**
 * Health-data dump for the external API (consumed by the user's health "chief
 * of staff" and a Notion-sync job). Superset of the backup export, plus cardio /
 * bodyweight / symptom / goal tables that matter for a holistic health overview.
 *
 * SECURITY: deliberately excludes secret/non-health tables — strava_tokens
 * (OAuth credentials) and chat_conversations/chat_messages (AI chat history).
 * Returns a plain object (not stringified) so the route can serve it directly.
 *
 * INCREMENTAL SYNC: pass `since` (a Date) to return only rows newer than that
 * watermark, for clients that poll and dedupe. Semantics:
 *  - Each collection is filtered by its delta column (`created_at` for all
 *    except `user_context`, which only has `updated_at`) using `>` (exclusive),
 *    so a client can pass the max timestamp it already has without re-receiving it.
 *  - `exercises` is ALWAYS returned in full — it's small, rarely changes, and a
 *    filtered set may reference an exercise created before `since`.
 *  - `workouts` returns those created after `since` UNION any workout referenced
 *    by a returned set (even if the workout itself predates `since`), so the
 *    client can always resolve `performed_on` for every returned set.
 * Omitting `since` returns the full export (unchanged backfill behavior).
 */
export async function generateHealthExport(since?: Date) {
  const [
    equipment,
    exercises,
    workouts,
    sets,
    templates,
    template_exercises,
    routines,
    routine_days,
    routine_skips,
    injury_areas,
    symptom_checkins,
    exercise_notes,
    cardio_sessions,
    bodyweight_logs,
    benchmark_lifts,
    lift_goals,
    user_profile,
    user_context,
  ] = await Promise.all([
    // equipment: tiny catalog referenced by exercises — always in full.
    // May not exist yet (migration 0017) — tolerate like lift_goals below.
    Promise.resolve(supabase.from("equipment").select("*").order("name")).then(
      (r) => r,
      () => ({ data: [] as Row[] }),
    ),
    // exercises: always the full catalog (see doc comment).
    supabase.from("exercises").select("*").order("name"),
    // workouts: fetch full set; we resolve the since-union in code below so we
    // can include parents of new sets whose own created_at is older than `since`.
    supabase.from("workouts").select("*").order("performed_on"),
    // sets is the one table that routinely exceeds Supabase's 1000-row cap —
    // paginate so the export is complete. Apply the since filter at the DB level
    // so the response (and work) scales with rows-after-since, not total rows.
    fetchAllRows<Row>((from, to) => {
      let q = supabase.from("sets").select("*").order("created_at");
      if (since) q = q.gt("created_at", since.toISOString());
      return q.range(from, to);
    }).then((rows) => ({ data: rows })),
    sinceQuery("templates", "created_at", since, (q) => q.order("name")),
    sinceQuery("template_exercises", "created_at", since),
    sinceQuery("routines", "created_at", since, (q) => q.order("name")),
    sinceQuery("routine_days", "created_at", since),
    sinceQuery("routine_skips", "created_at", since),
    sinceQuery("injury_areas", "created_at", since, (q) => q.order("name")),
    sinceQuery("symptom_checkins", "created_at", since, (q) => q.order("checked_on")),
    sinceQuery("exercise_notes", "created_at", since, (q) => q.order("created_at")),
    sinceQuery("cardio_sessions", "created_at", since, (q) => q.order("performed_on")),
    sinceQuery("bodyweight_logs", "created_at", since, (q) => q.order("measured_on")),
    sinceQuery("benchmark_lifts", "created_at", since),
    // lift_goals may not exist if its migration wasn't applied — tolerate that.
    // supabase-js resolves (doesn't reject) on a missing table, so coalesce a
    // null/errored data field to [] via the second then-handler.
    Promise.resolve(sinceQuery("lift_goals", "created_at", since)).then(
      (r) => r,
      () => ({ data: [] as Row[] }),
    ),
    sinceQuery("user_profile", "created_at", since),
    // user_context has no created_at — its only timestamp is updated_at.
    sinceQuery("user_context", "updated_at", since),
  ]);

  const setRows = (sets.data ?? []) as Row[];
  let workoutRows = (workouts.data ?? []) as Row[];

  if (since) {
    // Filter workouts to those created after `since`, then add back any workout
    // referenced by a returned set so the client can resolve performed_on.
    const sinceMs = since.getTime();
    const neededWorkoutIds = new Set(setRows.map((s) => s.workout_id as string));
    workoutRows = workoutRows.filter((w) => {
      const createdMs = new Date(w.created_at as string).getTime();
      return createdMs > sinceMs || neededWorkoutIds.has(w.id as string);
    });
  }

  const result = {
    exported_at: new Date().toISOString(),
    schema_version: 1,
    equipment: equipment.data ?? [],
    exercises: exercises.data ?? [],
    workouts: workoutRows,
    sets: setRows,
    templates: templates.data ?? [],
    template_exercises: template_exercises.data ?? [],
    routines: routines.data ?? [],
    routine_days: routine_days.data ?? [],
    routine_skips: routine_skips.data ?? [],
    injury_areas: injury_areas.data ?? [],
    symptom_checkins: symptom_checkins.data ?? [],
    exercise_notes: exercise_notes.data ?? [],
    cardio_sessions: cardio_sessions.data ?? [],
    bodyweight_logs: bodyweight_logs.data ?? [],
    benchmark_lifts: benchmark_lifts.data ?? [],
    lift_goals: lift_goals.data ?? [],
    user_profile: user_profile.data ?? [],
    user_context: user_context.data ?? [],
  };

  // next_since: max delta timestamp across all returned rows (excluding the
  // always-full `exercises` catalog, whose old timestamps would pin the
  // watermark backwards). Lets the client advance its watermark for free.
  const nextSince = maxTimestamp(result);

  return { ...result, next_since: nextSince };
}

// Minimal row shape for the helpers below (tables are untyped via supabase-js).
type Row = Record<string, unknown>;

/**
 * Build a "select all, optionally filtered by `<col> > since`" query for a table,
 * with an optional extra modifier (e.g. ordering). Returns the awaited result.
 */
function sinceQuery(
  table: string,
  col: string,
  since: Date | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modify?: (q: any) => any,
): PromiseLike<{ data: Row[] | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase.from(table).select("*");
  if (modify) q = modify(q);
  if (since) q = q.gt(col, since.toISOString());
  return q as PromiseLike<{ data: Row[] | null }>;
}

/**
 * Max delta timestamp across all returned collections except `exercises`
 * (always full) and `exported_at`/`schema_version`. Returns null if no rows.
 */
function maxTimestamp(result: Record<string, unknown>): string | null {
  let max: string | null = null;
  for (const [key, value] of Object.entries(result)) {
    // Full-catalog tables (not since-filtered) must not advance the cursor.
    if (key === "exercises" || key === "equipment" || !Array.isArray(value)) continue;
    for (const row of value as Row[]) {
      const ts = (row.created_at ?? row.updated_at) as string | undefined;
      if (ts && (max === null || ts > max)) max = ts;
    }
  }
  return max;
}

/**
 * Flat CSV of every logged set with exercise metadata joined in.
 * One row per set. L/R sides on separate rows for unilateral.
 */
export async function generateSetsCSV() {
  // Paginate past the 1000-row cap; created_at tiebreaker keeps pages stable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllRows<any>((from, to) =>
    supabase
      .from("sets")
      .select(
        "set_index, side, reps, load, rpe, notes, created_at, workouts!inner(performed_on, notes), exercises!inner(name, equipment_type, body_part, is_unilateral)"
      )
      .order("workouts(performed_on)", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, to)
  );

  const headers = [
    "Date",
    "Exercise",
    "Side",
    "Set",
    "Reps",
    "Load (lbs)",
    "RPE",
    "Set Notes",
    "Workout Notes",
    "Equipment",
    "Body Part",
    "Unilateral",
    "Logged At",
  ];

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [headers.join(",")];
  for (const r of rows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (r as any).workouts;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = (r as any).exercises;
    lines.push(
      [
        w.performed_on,
        ex.name,
        r.side,
        r.set_index,
        r.reps,
        r.load,
        r.rpe ?? "",
        r.notes ?? "",
        w.notes ?? "",
        ex.equipment_type ?? "",
        ex.body_part ?? "",
        ex.is_unilateral ? "true" : "false",
        r.created_at,
      ]
        .map(escape)
        .join(",")
    );
  }
  return lines.join("\n");
}

/**
 * CSV of symptom check-ins joined with injury area names.
 */
export async function generateSymptomsCSV() {
  const { data: rows } = await supabase
    .from("symptom_checkins")
    .select("*, injury_areas!inner(name)")
    .order("checked_on", { ascending: true });

  const headers = [
    "Date",
    "Area",
    "Severity",
    "Affected Sleep",
    "Affected Workout",
    "Notes",
    "Logged At",
  ];

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [headers.join(",")];
  for (const r of rows ?? []) {
    lines.push(
      [
        r.checked_on,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r as any).injury_areas.name,
        r.severity,
        r.affected_sleep ? "true" : "false",
        r.affected_workout ? "true" : "false",
        r.notes ?? "",
        r.created_at,
      ]
        .map(escape)
        .join(",")
    );
  }
  return lines.join("\n");
}
