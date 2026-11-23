import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  integer,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// Named plate-loaded implements (trap bar, EZ bar, ...) with their empty-bar
// weight. An exercise referencing one gets plate math at that bar's weight.
export const equipment = pgTable("equipment", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  barWeight: numeric("bar_weight").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  isUnilateral: boolean("is_unilateral").notNull().default(false),
  equipmentId: uuid("equipment_id").references(() => equipment.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    performedOn: date("performed_on").notNull().defaultNow(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("workouts_one_per_day").on(table.performedOn)]
);

export const sets = pgTable(
  "sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workoutId: uuid("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    setIndex: integer("set_index").notNull(),
    side: text("side").notNull(), // 'left' | 'right' | 'both'
    reps: integer("reps").notNull(),
    load: numeric("load").notNull(),
    rpe: numeric("rpe"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sets_workout_idx").on(table.workoutId),
    index("sets_exercise_idx").on(table.exerciseId),
  ]
);

// Per-exercise strength goals. A user sets a target e1RM (and optional target
// date) for a specific exercise; /eta then projects toward the personal target
// instead of (or alongside) the next generic StrengthLevel tier.
export const liftGoals = pgTable(
  "lift_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    targetE1rm: numeric("target_e1rm").notNull(),
    targetDate: date("target_date"),
    note: text("note"),
    achievedOn: date("achieved_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("lift_goals_one_per_exercise").on(table.exerciseId)]
);

// TypeScript types derived from schema
export type Equipment = typeof equipment.$inferSelect;
export type NewEquipment = typeof equipment.$inferInsert;
export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
export type Set = typeof sets.$inferSelect;
export type NewSet = typeof sets.$inferInsert;
export type LiftGoal = typeof liftGoals.$inferSelect;
export type NewLiftGoal = typeof liftGoals.$inferInsert;
