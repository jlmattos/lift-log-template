"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AddExerciseSheet } from "@/components/add-exercise-sheet";
import { bodyPartLabel } from "@/lib/body-parts";

type Exercise = {
  id: string;
  name: string;
  is_unilateral: boolean;
  equipment_type?: string;
  body_part?: string;
};

const EQUIPMENT_FILTERS = [
  { value: "all", label: "All equipment" },
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "machine", label: "Machine" },
  { value: "cable", label: "Cable" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "other", label: "Other" },
];

const BODY_PART_FILTERS = [
  { value: "all", label: "All body parts" },
  { value: "push", label: "All Push" },
  { value: "pull", label: "All Pull" },
  { value: "legs", label: "All Legs" },
  { value: "chest", label: "Chest" },
  { value: "back", label: "Back" },
  { value: "shoulders", label: "Shoulders" },
  { value: "biceps", label: "Biceps" },
  { value: "triceps", label: "Triceps" },
  { value: "quads", label: "Quads" },
  { value: "hamstrings", label: "Hamstrings" },
  { value: "glutes", label: "Glutes" },
  { value: "calves", label: "Calves" },
  { value: "core", label: "Core" },
  { value: "forearms", label: "Forearms" },
  { value: "full_body", label: "Full body" },
  { value: "other", label: "Other" },
];

// Categories with the muscles that roll up into them
const PUSH_MUSCLES = ["push", "chest", "shoulders", "triceps"];
const PULL_MUSCLES = ["pull", "back", "biceps", "forearms"];
const LEGS_MUSCLES = ["legs", "quads", "hamstrings", "glutes", "calves"];

export function ExercisesList({ exercises }: { exercises: Exercise[] }) {
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [equipFilter, setEquipFilter] = useState("all");
  const [bodyFilter, setBodyFilter] = useState("all");

  const filtered = useMemo(() => {
    return exercises.filter((e) => {
      // Search
      if (search.trim() && !e.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      // Equipment
      if (equipFilter !== "all" && (e.equipment_type ?? "other") !== equipFilter) {
        return false;
      }
      // Body part (with category rollup)
      if (bodyFilter !== "all") {
        const bp = e.body_part ?? "other";
        if (bodyFilter === "push" && !PUSH_MUSCLES.includes(bp)) return false;
        if (bodyFilter === "pull" && !PULL_MUSCLES.includes(bp)) return false;
        if (bodyFilter === "legs" && !LEGS_MUSCLES.includes(bp)) return false;
        if (!["push", "pull", "legs"].includes(bodyFilter) && bp !== bodyFilter) return false;
      }
      return true;
    });
  }, [exercises, search, equipFilter, bodyFilter]);

  return (
    <div className="mt-4 space-y-3">
      {/* Add new exercise */}
      <Button
        onClick={() => setAddSheetOpen(true)}
        className="w-full h-12 font-semibold"
      >
        + Create New Exercise
      </Button>

      {/* Search */}
      <Input
        type="search"
        placeholder="Search exercises..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Filters */}
      <div className="grid grid-cols-2 gap-2">
        <select
          value={equipFilter}
          onChange={(e) => setEquipFilter(e.target.value)}
          className="h-10 text-sm px-3 rounded-md border border-input bg-background"
        >
          {EQUIPMENT_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          value={bodyFilter}
          onChange={(e) => setBodyFilter(e.target.value)}
          className="h-10 text-sm px-3 rounded-md border border-input bg-background"
        >
          {BODY_PART_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {exercises.length}
      </p>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-muted-foreground text-center py-8 text-sm">
            {exercises.length === 0
              ? "No exercises yet. Tap '+ Create New Exercise' above."
              : "No exercises match your filters."}
          </p>
        )}

        {filtered.map((exercise) => (
          <Link
            key={exercise.id}
            href={`/exercises/${exercise.id}`}
            className="block px-3 py-2.5 border border-border rounded-md hover:bg-accent/30 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate">{exercise.name}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {exercise.body_part && (
                  <span className="text-xs text-muted-foreground/80">
                    {bodyPartLabel(exercise.body_part)}
                  </span>
                )}
                {exercise.is_unilateral && (
                  <span className="text-xs text-blue-300/70">L/R</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <AddExerciseSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        mode="manage"
      />
    </div>
  );
}
