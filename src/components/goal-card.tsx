"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { setGoal, removeGoal, type LiftGoal } from "@/actions/goals";

export function GoalCard({
  exerciseId,
  goal,
  currentBestE1RM,
}: {
  exerciseId: string;
  goal: LiftGoal | null;
  currentBestE1RM: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [target, setTarget] = useState(goal ? String(Math.round(Number(goal.target_e1rm))) : "");
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? "");
  const [note, setNote] = useState(goal?.note ?? "");

  // Reset the form to the current goal whenever the sheet opens (render-phase
  // reset via previous-value tracking).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTarget(goal ? String(Math.round(Number(goal.target_e1rm))) : "");
      setTargetDate(goal?.target_date ?? "");
      setNote(goal?.note ?? "");
    }
  }

  function handleSave() {
    const t = parseFloat(target);
    if (!t || t <= 0) return;
    startTransition(async () => {
      await setGoal(exerciseId, t, targetDate || null, note || null);
      setOpen(false);
      router.refresh();
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await removeGoal(exerciseId);
      setOpen(false);
      router.refresh();
    });
  }

  const targetNum = goal ? Math.round(Number(goal.target_e1rm)) : 0;
  const cur = Math.round(currentBestE1RM);
  const achieved = goal != null && cur >= targetNum;
  const pct = goal && targetNum > 0 ? Math.min(100, Math.round((cur / targetNum) * 100)) : 0;
  const gap = goal ? Math.max(0, targetNum - cur) : 0;

  return (
    <>
      {goal ? (
        <Card
          className={`p-4 mb-4 cursor-pointer transition-colors hover:bg-accent/40 ${
            achieved ? "bg-emerald-400/5 border-emerald-400/30" : "bg-purple-400/5 border-purple-400/30"
          }`}
          onClick={() => setOpen(true)}
        >
          <div className="flex items-center justify-between mb-2">
            <p className={`text-xs uppercase tracking-wider font-semibold ${achieved ? "text-emerald-300" : "text-purple-300"}`}>
              {achieved ? "🎯 Goal reached" : "🎯 Goal"}
            </p>
            <span className="text-xs text-muted-foreground">Edit</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold tabular-nums">
              {cur} <span className="text-sm font-normal text-muted-foreground">/ {targetNum} lbs e1RM</span>
            </p>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-2 bg-muted/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${achieved ? "bg-emerald-400" : "bg-purple-400"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
            <span>{pct}% there{!achieved && gap > 0 ? ` · ${gap} lbs to go` : ""}</span>
            {goal.target_date && (
              <span>by {new Date(goal.target_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            )}
          </div>
          {goal.note && <p className="text-[11px] text-muted-foreground mt-1 italic">{goal.note}</p>}
        </Card>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full mb-4 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md py-2.5 transition-colors"
        >
          🎯 Set a goal for this lift
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-w-md mx-auto">
          <SheetHeader>
            <SheetTitle>{goal ? "Edit goal" : "Set a goal"}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Target e1RM (lbs)</Label>
              <Input
                inputMode="decimal"
                placeholder="225"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-12 text-center text-lg mt-1"
              />
              {cur > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1 text-center">Current best e1RM: {cur} lbs</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Target date (optional)</Label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Note (optional)</Label>
              <Input
                placeholder="e.g. for spring meet"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={isPending || !target} className="flex-1 h-12 font-semibold">
                {isPending ? "Saving..." : goal ? "Update goal" : "Set goal"}
              </Button>
              {goal && (
                <Button
                  onClick={handleRemove}
                  disabled={isPending}
                  variant="outline"
                  className="h-12 text-red-300 hover:text-red-200"
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
