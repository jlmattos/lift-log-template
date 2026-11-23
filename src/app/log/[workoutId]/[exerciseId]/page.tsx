import { getExercise } from "@/actions/exercises";
import {
  getSetsForExercise,
  getLastSetForExercise,
  getLastSession,
} from "@/actions/sets";
import { listExerciseNotes } from "@/actions/exercise-notes";
import { SetLogger } from "@/components/set-logger";
import { ExerciseNotesSection } from "@/components/exercise-notes-section";
import { resolveBar } from "@/lib/barbell";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LogPage({
  params,
}: {
  params: Promise<{ workoutId: string; exerciseId: string }>;
}) {
  const { workoutId, exerciseId } = await params;
  const [exercise, existingSets, lastSets, lastSession, notes] = await Promise.all([
    getExercise(exerciseId),
    getSetsForExercise(workoutId, exerciseId),
    getLastSetForExercise(exerciseId),
    getLastSession(exerciseId, workoutId),
    listExerciseNotes(exerciseId),
  ]);

  if (!exercise) {
    return (
      <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-6">
        <p>Exercise not found.</p>
        <Link href="/" className="text-primary underline">Back to today</Link>
      </div>
    );
  }

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{exercise.name}</h1>
          {exercise.is_unilateral && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Unilateral — L/R</span>
          )}
        </div>
      </div>

      {/* Sticky notes (form cues, mods, etc.) — fully editable from here too */}
      <ExerciseNotesSection exerciseId={exerciseId} initialNotes={notes} />

      <SetLogger
        workoutId={workoutId}
        exerciseId={exerciseId}
        isUnilateral={exercise.is_unilateral}
        bar={resolveBar(exercise)}
        existingSets={existingSets}
        lastSets={lastSets}
        lastSession={lastSession}
      />
    </div>
  );
}
