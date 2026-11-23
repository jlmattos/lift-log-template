"use client";

import { useState, useTransition } from "react";
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
import {
  updateExercise,
  deleteExercise,
  type EquipmentType,
  type BodyPart,
} from "@/actions/exercises";
import { BODY_PART_GROUPS, BODY_PART_OPTIONS as ALL_BODY_PARTS } from "@/lib/body-parts";
import { EquipmentPicker } from "@/components/equipment-picker";

const EQUIPMENT_OPTIONS: { value: EquipmentType; label: string }[] = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "machine", label: "Machine" },
  { value: "cable", label: "Cable" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "other", label: "Other" },
];

// Body part options now come from lib/body-parts.ts

type Exercise = {
  id: string;
  name: string;
  is_unilateral: boolean;
  equipment_type?: string;
  body_part?: string;
  equipment_id?: string | null;
};

export function EditExerciseSheet({
  open,
  onOpenChange,
  exercise,
  hasSets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: Exercise;
  hasSets: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(exercise.name);
  const [isUnilateral, setIsUnilateral] = useState(exercise.is_unilateral);
  const [equipmentType, setEquipmentType] = useState<EquipmentType>(
    (exercise.equipment_type as EquipmentType) ?? "other"
  );
  const [bodyPart, setBodyPart] = useState<BodyPart>(
    (exercise.body_part as BodyPart) ?? "other"
  );
  const [equipmentId, setEquipmentId] = useState<string | null>(
    exercise.equipment_id ?? null
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // When the sheet opens (or the target exercise changes while open), reset the
  // form to that exercise's values. Done during render via previous-value
  // tracking — React's sanctioned alternative to a state-setting effect.
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const openKey = open ? exercise.id : null;
  if (openKey !== prevKey) {
    setPrevKey(openKey);
    if (open) {
      setName(exercise.name);
      setIsUnilateral(exercise.is_unilateral);
      setEquipmentType((exercise.equipment_type as EquipmentType) ?? "other");
      setBodyPart((exercise.body_part as BodyPart) ?? "other");
      setEquipmentId(exercise.equipment_id ?? null);
      setConfirmDelete(false);
      setDeleteError(null);
      setSaveError(null);
    }
  }

  function handleDelete() {
    setDeleteError(null);
    startTransition(async () => {
      try {
        await deleteExercise(exercise.id);
        onOpenChange(false);
        router.push("/exercises");
        router.refresh();
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "Delete failed");
        setConfirmDelete(false);
      }
    });
  }

  function handleSave() {
    if (!name.trim()) return;
    setSaveError(null);
    startTransition(async () => {
      try {
        await updateExercise(exercise.id, {
          name,
          isUnilateral,
          equipmentType,
          bodyPart,
          // Only send when changed — keeps edits working while migration 0017
          // (which adds the column) is unapplied.
          equipmentId:
            equipmentId !== (exercise.equipment_id ?? null) ? equipmentId : undefined,
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Exercise</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="exerciseName">Name</Label>
            <Input
              id="exerciseName"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
            active={open}
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
                {hasSets
                  ? "Locked — exercise has logged sets"
                  : "Track left and right sides independently"}
              </p>
            </div>
            <Switch
              id="unilateral"
              checked={isUnilateral}
              onCheckedChange={setIsUnilateral}
              disabled={hasSets}
            />
          </div>

          {saveError && (
            <p className="text-xs text-red-300 bg-red-400/10 border border-red-400/30 rounded-md p-2">
              {saveError}
            </p>
          )}

          <Button
            onClick={handleSave}
            disabled={!name.trim() || isPending}
            className="w-full h-12"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </Button>

          <div className="pt-2">
            {deleteError && (
              <div className="mb-2 p-3 border border-amber-400/30 bg-amber-400/5 rounded-md">
                <p className="text-xs text-amber-300">{deleteError}</p>
              </div>
            )}

            {!confirmDelete ? (
              <Button
                onClick={() => setConfirmDelete(true)}
                variant="ghost"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                Delete Exercise
              </Button>
            ) : (
              <div className="space-y-2 p-3 border border-destructive/30 bg-destructive/5 rounded-md">
                <p className="text-sm text-destructive">
                  Delete &ldquo;{exercise.name}&rdquo;? This will also remove it from any templates.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setConfirmDelete(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={handleDelete} disabled={isPending} variant="destructive" className="flex-1">
                    {isPending ? "Deleting..." : "Yes, delete"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
