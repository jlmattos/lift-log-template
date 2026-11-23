"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  listExercises,
  createExercise,
  type EquipmentType,
  type BodyPart,
} from "@/actions/exercises";
import { BODY_PART_GROUPS, BODY_PART_OPTIONS as ALL_BODY_PARTS } from "@/lib/body-parts";
import { getOrCreateTodayWorkout, skipPlannedExercise } from "@/actions/workouts";
import { EquipmentPicker } from "@/components/equipment-picker";

type Exercise = {
  id: string;
  name: string;
  is_unilateral: boolean;
  equipment_type?: string;
  equipment?: { name: string; bar_weight: number | string } | null;
};

const EQUIPMENT_OPTIONS: { value: EquipmentType; label: string }[] = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "machine", label: "Machine" },
  { value: "cable", label: "Cable" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "other", label: "Other" },
];

// Use the expanded muscle-group list from lib/body-parts.ts

export function AddExerciseSheet({
  open,
  onOpenChange,
  workoutId,
  mode = "log",
  swapOutExerciseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workoutId?: string;
  /** "log" = after selecting/creating, navigate to set logger. "manage" = just close (used on /exercises page). */
  mode?: "log" | "manage";
  /** When set, this is a SWAP: the given planned exercise is skipped for the
   *  current workout before navigating to log the chosen replacement. */
  swapOutExerciseId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [isUnilateral, setIsUnilateral] = useState(false);
  const [equipmentType, setEquipmentType] = useState<EquipmentType>("other");
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [bodyPart, setBodyPart] = useState<BodyPart>("other");
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset the form the moment the sheet opens. Done during render (not in an
  // effect) via previous-value tracking — React's sanctioned pattern for
  // resetting state when a prop changes, avoiding a cascading re-render.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSearch("");
      setShowCreate(false);
      setNewName("");
      setIsUnilateral(false);
      setEquipmentType("other");
      setEquipmentId(null);
      setBodyPart("other");
      setCreateError(null);
    }
  }

  // Load the exercise list when the sheet opens (genuine async side effect).
  useEffect(() => {
    if (open) listExercises().then(setExercises).catch(() => {});
  }, [open]);

  const filtered = exercises.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSelectExercise(exerciseId: string) {
    startTransition(async () => {
      if (mode === "manage") {
        // Just close — used on /exercises page
        onOpenChange(false);
        router.push(`/exercises/${exerciseId}`);
        router.refresh();
        return;
      }
      const workout = workoutId
        ? { id: workoutId }
        : await getOrCreateTodayWorkout();
      // Swap: drop the planned exercise from this workout before logging the pick.
      if (swapOutExerciseId) await skipPlannedExercise(workout.id, swapOutExerciseId);
      onOpenChange(false);
      router.push(`/log/${workout.id}/${exerciseId}`);
      router.refresh();
    });
  }

  async function handleCreateExercise() {
    if (!newName.trim()) return;
    setCreateError(null);
    startTransition(async () => {
      try {
        const exercise = await createExercise(
          newName,
          isUnilateral,
          equipmentType,
          bodyPart,
          equipmentId
        );
        if (mode === "manage") {
          onOpenChange(false);
          router.push(`/exercises/${exercise.id}`);
          router.refresh();
          return;
        }
        const workout = workoutId
          ? { id: workoutId }
          : await getOrCreateTodayWorkout();
        if (swapOutExerciseId) await skipPlannedExercise(workout.id, swapOutExerciseId);
        onOpenChange(false);
        router.push(`/log/${workout.id}/${exercise.id}`);
        router.refresh();
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Create failed");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{swapOutExerciseId ? "Swap in exercise" : "Add Exercise"}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {!showCreate ? (
            <>
              <Input
                placeholder="Search exercises..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />

              <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                {filtered.map((exercise) => (
                  <Card
                    key={exercise.id}
                    className="p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => handleSelectExercise(exercise.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{exercise.name}</span>
                      <div className="flex gap-1">
                        {exercise.equipment ? (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {exercise.equipment.name}
                          </span>
                        ) : (
                          exercise.equipment_type === "barbell" && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              BB
                            </span>
                          )
                        )}
                        {exercise.is_unilateral && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            L/R
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}

                {filtered.length === 0 && search && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No exercises found
                  </p>
                )}
              </div>

              <Button
                onClick={() => {
                  setShowCreate(true);
                  setNewName(search);
                }}
                variant="outline"
                className="w-full"
              >
                + Create New Exercise
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="exerciseName">Exercise Name</Label>
                <Input
                  id="exerciseName"
                  placeholder="e.g., Bulgarian Split Squat"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <Label>Equipment</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {EQUIPMENT_OPTIONS.map((opt) => {
                    const isSelected = equipmentType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setEquipmentType(opt.value)}
                        className={`relative px-3 py-2.5 text-sm rounded-md border-2 font-medium transition-all ${
                          isSelected
                            ? "border-blue-400 bg-blue-400/15 text-blue-300 shadow-[0_0_0_3px_rgba(96,165,250,0.15)]"
                            : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                        }`}
                      >
                        {isSelected && (
                          <span className="absolute top-1 right-1.5 text-blue-300 text-xs">✓</span>
                        )}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <EquipmentPicker
                value={equipmentId}
                onChange={setEquipmentId}
                active={open && showCreate}
                equipmentType={equipmentType}
              />

              <div>
                <Label>Body Part / Muscle Group</Label>
                <div className="space-y-2 mt-1">
                  {BODY_PART_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-1">
                        {group.label}
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {group.options.map((value) => {
                          const opt = ALL_BODY_PARTS.find((o) => o.value === value);
                          if (!opt) return null;
                          const isSelected = bodyPart === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setBodyPart(opt.value as BodyPart)}
                              className={`relative px-2 py-2 text-xs rounded-md border-2 font-medium transition-all ${
                                isSelected
                                  ? "border-blue-400 bg-blue-400/15 text-blue-300"
                                  : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="unilateral">Unilateral (L/R)</Label>
                  <p className="text-xs text-muted-foreground">
                    Track left and right sides independently
                  </p>
                </div>
                <Switch
                  id="unilateral"
                  checked={isUnilateral}
                  onCheckedChange={setIsUnilateral}
                />
              </div>

              {createError && (
                <p className="text-xs text-red-300 bg-red-400/10 border border-red-400/30 rounded-md p-2">
                  {createError}
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCreate(false)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleCreateExercise}
                  disabled={!newName.trim() || isPending}
                  className="flex-1"
                >
                  {isPending ? "Creating..." : "Create & Log"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
