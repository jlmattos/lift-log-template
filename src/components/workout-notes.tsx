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
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { updateWorkoutNotes } from "@/actions/workouts";

export function WorkoutNotes({
  workoutId,
  initialNotes,
  compact = false,
}: {
  workoutId: string;
  initialNotes: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initialNotes ?? "");

  function handleSave() {
    startTransition(async () => {
      await updateWorkoutNotes(workoutId, text);
      setOpen(false);
      router.refresh();
    });
  }

  function handleOpen() {
    setText(initialNotes ?? "");
    setOpen(true);
  }

  const hasNotes = initialNotes && initialNotes.trim().length > 0;

  return (
    <>
      {compact ? (
        // Compact button-only mode (for Today page)
        <button
          onClick={handleOpen}
          className="w-full text-left"
        >
          <Card className={`p-3 hover:bg-accent/30 transition-colors ${hasNotes ? "" : "border-dashed"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Workout Notes
                </p>
                {hasNotes ? (
                  <p className="text-sm mt-1 line-clamp-2">{initialNotes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground/60 mt-1">
                    + Add notes about today&rsquo;s session
                  </p>
                )}
              </div>
              {hasNotes && (
                <span className="text-xs text-muted-foreground shrink-0">Edit</span>
              )}
            </div>
          </Card>
        </button>
      ) : (
        // Full mode (for workout detail page)
        <Card className={`p-4 ${hasNotes ? "" : "border-dashed"}`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Notes
            </p>
            <button
              onClick={handleOpen}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {hasNotes ? "Edit" : "Add"}
            </button>
          </div>
          {hasNotes ? (
            <p className="text-sm whitespace-pre-wrap">{initialNotes}</p>
          ) : (
            <p className="text-sm text-muted-foreground/60">No notes</p>
          )}
        </Card>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Workout Notes</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="notes" className="text-xs text-muted-foreground">
                How did it feel? Any tweaks, observations, context?
              </Label>
              <textarea
                id="notes"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g., shoulder felt better today, gym was crowded, slept badly..."
                rows={6}
                className="w-full mt-1 px-3 py-2 text-sm bg-background border border-input rounded-md resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                autoFocus
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={isPending}
              className="w-full h-12"
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
