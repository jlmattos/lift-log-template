import { getWorkoutWithSets } from "@/actions/workouts";
import { Card } from "@/components/ui/card";
import { DeleteWorkoutButton } from "@/components/delete-workout-button";
import { WorkoutNotes } from "@/components/workout-notes";
import { formatDuration, computeWorkoutDuration } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ workoutId: string }>;
}) {
  const { workoutId } = await params;
  const data = await getWorkoutWithSets(workoutId);

  if (!data) {
    return (
      <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
        <p>Workout not found.</p>
        <Link href="/history" className="text-primary underline">Back to history</Link>
      </div>
    );
  }

  const date = new Date(data.workout.performed_on + "T12:00:00");
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const allSets = data.exercises.flatMap(({ sets }) => sets);
  const durationStr = formatDuration(computeWorkoutDuration(allSets));

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/progress" className="text-muted-foreground hover:text-foreground transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{dateStr}</h1>
          {durationStr && (
            <p className="text-xs text-muted-foreground">Duration: {durationStr}</p>
          )}
        </div>
      </div>

      <div className="space-y-4 mt-6">
        <WorkoutNotes
          workoutId={data.workout.id}
          initialNotes={data.workout.notes ?? null}
        />
        {data.exercises.map(({ exercise, sets }: { exercise: Record<string, unknown>; sets: Record<string, unknown>[] }) => {
          const isUnilateral = exercise.is_unilateral as boolean;
          const grouped = new Map<number, Record<string, unknown>[]>();
          for (const s of sets) {
            const idx = s.set_index as number;
            if (!grouped.has(idx)) grouped.set(idx, []);
            grouped.get(idx)!.push(s);
          }
          const setGroups = Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);

          return (
            <Card key={exercise.id as string} className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-semibold">{exercise.name as string}</h2>
                {isUnilateral && (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">L/R</span>
                )}
              </div>
              <div className="space-y-1.5">
                {setGroups.map(([index, setGroup]) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <span className="text-xs text-muted-foreground font-mono w-6">#{index}</span>
                    {isUnilateral ? (
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        {setGroup.map((s) => (
                          <span key={s.id as string} className={(s.side as string) === "left" ? "text-blue-400" : "text-orange-400"}>
                            {(s.side as string)[0].toUpperCase()}: {s.reps as number}x{s.load as number}
                            {s.rpe ? <span className="text-muted-foreground"> @{String(s.rpe)}</span> : null}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span>
                        {setGroup[0].reps as number} x {setGroup[0].load as number} lbs
                        {setGroup[0].rpe ? <span className="text-muted-foreground"> @ RPE {String(setGroup[0].rpe)}</span> : null}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}

        {data.exercises.length === 0 && (
          <p className="text-muted-foreground text-center py-8">No exercises logged in this workout.</p>
        )}

        <div className="pt-6">
          <DeleteWorkoutButton workoutId={data.workout.id} />
        </div>
      </div>
    </div>
  );
}
