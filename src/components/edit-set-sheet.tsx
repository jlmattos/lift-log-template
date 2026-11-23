"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { NumberField } from "@/components/number-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PlateDisplay } from "@/components/plate-display";
import type { BarInfo } from "@/lib/barbell";
import { parseRpe } from "@/lib/format";
import {
  updateBilateralSet,
  updateUnilateralSet,
  deleteSetRound,
} from "@/actions/sets";

type SetData = {
  id: string;
  set_index: number;
  side: string;
  reps: number;
  load: number;
  rpe: number | null;
};

export function EditSetSheet({
  open,
  onOpenChange,
  setIndex,
  sets,
  workoutId,
  exerciseId,
  isUnilateral,
  bar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setIndex: number | null;
  sets: SetData[];
  workoutId: string;
  exerciseId: string;
  isUnilateral: boolean;
  bar: BarInfo | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Bilateral state
  const [reps, setReps] = useState("");
  const [load, setLoad] = useState("");
  const [rpe, setRpe] = useState("");

  // Unilateral state
  const [leftReps, setLeftReps] = useState("");
  const [leftLoad, setLeftLoad] = useState("");
  const [leftRpe, setLeftRpe] = useState("");
  const [rightReps, setRightReps] = useState("");
  const [rightLoad, setRightLoad] = useState("");
  const [rightRpe, setRightRpe] = useState("");

  // Populate the form from the selected set whenever the sheet opens on a new
  // set. Done during render via previous-value tracking — React's sanctioned
  // alternative to a state-setting effect.
  const openSetKey = open && setIndex !== null ? `${setIndex}` : null;
  const [prevSetKey, setPrevSetKey] = useState<string | null>(null);
  if (openSetKey !== prevSetKey) {
    setPrevSetKey(openSetKey);
    if (openSetKey !== null) {
      setConfirmDelete(false);
      if (isUnilateral) {
        const left = sets.find((s) => s.side === "left");
        const right = sets.find((s) => s.side === "right");
        setLeftReps(left?.reps?.toString() ?? "");
        setLeftLoad(left?.load?.toString() ?? "");
        setLeftRpe(left?.rpe?.toString() ?? "");
        setRightReps(right?.reps?.toString() ?? "");
        setRightLoad(right?.load?.toString() ?? "");
        setRightRpe(right?.rpe?.toString() ?? "");
      } else {
        const s = sets[0];
        setReps(s?.reps?.toString() ?? "");
        setLoad(s?.load?.toString() ?? "");
        setRpe(s?.rpe?.toString() ?? "");
      }
    }
  }

  function handleSave() {
    if (setIndex === null) return;
    startTransition(async () => {
      if (isUnilateral) {
        await updateUnilateralSet(workoutId, exerciseId, setIndex, {
          left: {
            reps: parseInt(leftReps) || 0,
            load: parseFloat(leftLoad) || 0,
            rpe: parseRpe(leftRpe),
          },
          right: {
            reps: parseInt(rightReps) || 0,
            load: parseFloat(rightLoad) || 0,
            rpe: parseRpe(rightRpe),
          },
        });
      } else {
        const s = sets[0];
        await updateBilateralSet(s.id, {
          reps: parseInt(reps) || 0,
          load: parseFloat(load) || 0,
          rpe: parseRpe(rpe),
        });
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (setIndex === null) return;
    startTransition(async () => {
      await deleteSetRound(workoutId, exerciseId, setIndex);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            Edit Set #{setIndex !== null ? setIndex : ""}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {isUnilateral ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-blue-400 text-xs font-semibold uppercase tracking-wider">
                  Left
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Reps</Label>
                    <NumberField inputMode="numeric" value={leftReps} onChange={setLeftReps} className="h-12 text-center text-lg" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Load</Label>
                    <NumberField inputMode="decimal" value={leftLoad} onChange={setLeftLoad} className="h-12 text-center text-lg" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">RPE <span className="text-muted-foreground/50">(1-10)</span></Label>
                    <NumberField inputMode="decimal" min="1" max="10" step="0.5" value={leftRpe} onChange={setLeftRpe} className="h-12 text-center text-lg" />
                  </div>
                </div>
                {bar && <PlateDisplay targetWeight={leftLoad} barWeight={bar.weight} />}
              </div>
              <div className="space-y-2">
                <Label className="text-orange-400 text-xs font-semibold uppercase tracking-wider">
                  Right
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Reps</Label>
                    <NumberField inputMode="numeric" value={rightReps} onChange={setRightReps} className="h-12 text-center text-lg" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Load</Label>
                    <NumberField inputMode="decimal" value={rightLoad} onChange={setRightLoad} className="h-12 text-center text-lg" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">RPE <span className="text-muted-foreground/50">(1-10)</span></Label>
                    <NumberField inputMode="decimal" min="1" max="10" step="0.5" value={rightRpe} onChange={setRightRpe} className="h-12 text-center text-lg" />
                  </div>
                </div>
                {bar && <PlateDisplay targetWeight={rightLoad} barWeight={bar.weight} />}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Reps</Label>
                  <NumberField inputMode="numeric" value={reps} onChange={setReps} className="h-12 text-center text-lg" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Load</Label>
                  <NumberField inputMode="decimal" value={load} onChange={setLoad} className="h-12 text-center text-lg" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">RPE <span className="text-muted-foreground/50">(1-10)</span></Label>
                  <NumberField inputMode="decimal" min="1" max="10" step="0.5" value={rpe} onChange={setRpe} className="h-12 text-center text-lg" />
                </div>
              </div>
              {bar && <PlateDisplay targetWeight={load} barWeight={bar.weight} />}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={isPending}
              className="flex-1 h-12"
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>

          {!confirmDelete ? (
            <Button
              onClick={() => setConfirmDelete(true)}
              variant="ghost"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              Delete Set
            </Button>
          ) : (
            <div className="space-y-2 p-3 border border-destructive/30 bg-destructive/5 rounded-md">
              <p className="text-sm text-destructive">Delete this set?</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDelete}
                  disabled={isPending}
                  variant="destructive"
                  className="flex-1"
                >
                  {isPending ? "Deleting..." : "Yes, delete"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
