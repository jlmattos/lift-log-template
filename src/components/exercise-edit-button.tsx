"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EditExerciseSheet } from "@/components/edit-exercise-sheet";

type Exercise = {
  id: string;
  name: string;
  is_unilateral: boolean;
  equipment_type?: string;
  equipment_id?: string | null;
};

export function ExerciseEditButton({
  exercise,
  hasSets,
}: {
  exercise: Exercise;
  hasSets: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
        <span className="ml-1">Edit</span>
      </Button>
      <EditExerciseSheet
        open={open}
        onOpenChange={setOpen}
        exercise={exercise}
        hasSets={hasSets}
      />
    </>
  );
}
