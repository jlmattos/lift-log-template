"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteWorkout } from "@/actions/workouts";

export function DeleteWorkoutButton({ workoutId }: { workoutId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      await deleteWorkout(workoutId);
      router.push("/progress");
      router.refresh();
    });
  }

  if (!confirm) {
    return (
      <Button
        onClick={() => setConfirm(true)}
        variant="ghost"
        className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        Delete Workout
      </Button>
    );
  }

  return (
    <div className="space-y-2 p-3 border border-destructive/30 bg-destructive/5 rounded-md">
      <p className="text-sm text-destructive">
        Delete this entire workout? All sets will be removed permanently.
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => setConfirm(false)}
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
  );
}
