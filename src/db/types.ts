// Hand-authored snake_case row types for the core tables, matching what the
// Supabase JS client actually returns at runtime (the Drizzle types in
// schema.ts are camelCase and used only for migrations).
//
// Scope: the 3 hot-path tables (sets/workouts/exercises) that account for the
// bulk of queries. Other tables remain loosely typed at their call sites.
//
// NOTE: a few columns were added to the live DB out-of-band (not present in the
// drizzle/ migrations): exercises.body_part, exercises.equipment_type, and
// workouts.completed_at. They are modeled here as nullable.

export type ExerciseRow = {
  id: string;
  name: string;
  is_unilateral: boolean;
  created_at: string;
  body_part: string | null;
  equipment_type: string | null;
};

export type WorkoutRow = {
  id: string;
  performed_on: string;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
};

export type SetRow = {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_index: number;
  side: string; // 'left' | 'right' | 'both'
  reps: number;
  load: string; // numeric comes back as a string from supabase-js
  rpe: string | null;
  notes: string | null;
  created_at: string;
};

// A set joined with its parent exercise, as returned by
// `.select("*, exercises(*)")`.
export type SetWithExercise = SetRow & { exercises: ExerciseRow };
