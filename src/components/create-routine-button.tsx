"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRoutine } from "@/actions/routines";

export function CreateRoutineButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState("1");
  // "weekly" = weeks × 7 calendar grid. "cycle" = one N-day loop, untethered
  // from weekdays — "up next" advances by completion, not by calendar date.
  const [mode, setMode] = useState<"weekly" | "cycle">("weekly");
  const [cycleDays, setCycleDaysInput] = useState("9");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim()) return;
    const weeksNum = parseInt(weeks) || 1;
    const cycleNum = parseInt(cycleDays) || 9;
    startTransition(async () => {
      const r = await createRoutine(name, weeksNum, mode === "cycle" ? cycleNum : undefined);
      setOpen(false);
      setName("");
      setWeeks("1");
      setMode("weekly");
      setCycleDaysInput("9");
      router.push(`/routines/${r.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        className="w-full h-12 border-dashed text-muted-foreground"
      >
        + New Routine
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Routine</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="routineName">Routine Name</Label>
              <Input
                id="routineName"
                placeholder="e.g., PPL 2-Week Cycle"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label>Schedule type</Label>
              <div className="flex gap-1 bg-muted/40 rounded-md p-1 mt-1">
                <button
                  type="button"
                  onClick={() => setMode("weekly")}
                  className={`flex-1 text-center text-sm py-2 rounded transition-colors ${
                    mode === "weekly" ? "bg-blue-400 text-background font-medium" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setMode("cycle")}
                  className={`flex-1 text-center text-sm py-2 rounded transition-colors ${
                    mode === "cycle" ? "bg-blue-400 text-background font-medium" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Day cycle
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {mode === "weekly"
                  ? "Tied to weekdays (Mon–Sun grid). Today shows the day's plan by calendar."
                  : "An N-day loop untethered from weekdays — “up next” follows your plan order and advances as you complete sessions."}
              </p>
            </div>
            {mode === "weekly" ? (
              <div>
                <Label htmlFor="weeks">Cycle Length (weeks)</Label>
                <Input
                  id="weeks"
                  inputMode="numeric"
                  placeholder="1"
                  value={weeks}
                  onChange={(e) => setWeeks(e.target.value)}
                  className="h-12 text-center text-lg"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  How many weeks before the cycle repeats? Most splits are 1 or 2.
                </p>
              </div>
            ) : (
              <div>
                <Label htmlFor="cycleDays">Cycle Length (days)</Label>
                <Input
                  id="cycleDays"
                  inputMode="numeric"
                  placeholder="9"
                  value={cycleDays}
                  onChange={(e) => setCycleDaysInput(e.target.value)}
                  className="h-12 text-center text-lg"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  How many day-slots in the loop (2–21)? e.g. 9 for extra cardio and recovery days between lifts.
                </p>
              </div>
            )}
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || isPending}
              className="w-full h-12"
            >
              {isPending ? "Creating..." : "Create Routine"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
