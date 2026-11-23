"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteWorkout } from "@/actions/workouts";

export function CancelWorkoutButton({ workoutId }: { workoutId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  function handleCancel() {
    startTransition(async () => {
      await deleteWorkout(workoutId);
      router.refresh();
    });
  }

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="w-full text-center text-xs text-muted-foreground hover:text-destructive transition-colors py-2"
      >
        Cancel this workout (started by mistake?)
      </button>
    );
  }

  return (
    <div className="p-3 border border-destructive/30 bg-destructive/5 rounded-md space-y-2">
      <p className="text-sm text-destructive">
        Cancel this workout? No sets have been logged so it will be removed entirely.
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirm(false)}
          className="flex-1"
        >
          Keep it
        </Button>
        <Button
          onClick={handleCancel}
          disabled={isPending}
          variant="destructive"
          size="sm"
          className="flex-1"
        >
          {isPending ? "Canceling..." : "Yes, cancel"}
        </Button>
      </div>
    </div>
  );
}
