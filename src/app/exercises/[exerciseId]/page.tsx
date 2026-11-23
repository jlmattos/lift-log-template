import { getExercise } from "@/actions/exercises";
import { getExerciseHistory, getBestE1RM } from "@/actions/sets";
import { listExerciseNotes } from "@/actions/exercise-notes";
import { getDeepDive } from "@/actions/deep-dive";
import { getGoalForExercise } from "@/actions/goals";
import { GoalCard } from "@/components/goal-card";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ExerciseChartCard } from "@/components/exercise-chart-card";
import { ExerciseDeepDive } from "@/components/exercise-deep-dive";
import { ExerciseEditButton } from "@/components/exercise-edit-button";
import { ExerciseNotesSection } from "@/components/exercise-notes-section";
import { calculateE1RM, roundE1RM } from "@/lib/e1rm";
import { bodyPartLabel } from "@/lib/body-parts";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  const exercise = await getExercise(exerciseId);
  if (!exercise) {
    return (
      <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
        <p>Exercise not found.</p>
        <Link href="/exercises" className="text-primary underline">
          Back to exercises
        </Link>
      </div>
    );
  }

  const isUnilateral = exercise.is_unilateral as boolean;

  const [history, bestE1RM, notes, deepDive, goal] = await Promise.all([
    getExerciseHistory(exerciseId),
    getBestE1RM(exerciseId, isUnilateral),
    listExerciseNotes(exerciseId),
    getDeepDive(exerciseId, isUnilateral),
    getGoalForExercise(exerciseId),
  ]);

  // Current best e1RM across sides — the number a goal is measured against.
  const currentBestE1RM = Math.max(
    bestE1RM.both?.e1rm ?? 0,
    bestE1RM.left?.e1rm ?? 0,
    bestE1RM.right?.e1rm ?? 0,
  );

  // Build chart data: per session, top load and top e1RM
  const chartData = history
    .map((session) => {
      const date = new Date(session.performedOn + "T12:00:00");
      const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      if (isUnilateral) {
        const leftSets = session.sets.filter((s) => s.side === "left");
        const rightSets = session.sets.filter((s) => s.side === "right");
        const topLeftLoad = leftSets.reduce((m, s) => Math.max(m, parseFloat(s.load)), 0);
        const topRightLoad = rightSets.reduce((m, s) => Math.max(m, parseFloat(s.load)), 0);
        const topLeftE = leftSets.reduce(
          (m, s) => Math.max(m, calculateE1RM(parseFloat(s.load), s.reps)),
          0
        );
        const topRightE = rightSets.reduce(
          (m, s) => Math.max(m, calculateE1RM(parseFloat(s.load), s.reps)),
          0
        );
        return {
          date: label,
          left: topLeftLoad,
          right: topRightLoad,
          leftE1RM: roundE1RM(topLeftE),
          rightE1RM: roundE1RM(topRightE),
        };
      } else {
        const bothSets = session.sets.filter((s) => s.side === "both");
        const topLoad = bothSets.reduce((m, s) => Math.max(m, parseFloat(s.load)), 0);
        const topE = bothSets.reduce(
          (m, s) => Math.max(m, calculateE1RM(parseFloat(s.load), s.reps)),
          0
        );
        return {
          date: label,
          load: topLoad,
          e1rm: roundE1RM(topE),
        };
      }
    })
    .reverse();

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/exercises"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">{exercise.name as string}</h1>
          <div className="flex gap-1 mt-0.5 items-center flex-wrap">
            {exercise.body_part && (
              <span className="text-xs text-muted-foreground">
                {bodyPartLabel(exercise.body_part as string)}
              </span>
            )}
            {exercise.equipment ? (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {(exercise.equipment as { name: string; bar_weight: number | string }).name} ·{" "}
                {Number((exercise.equipment as { bar_weight: number | string }).bar_weight)} lb bar
              </span>
            ) : (
              exercise.equipment_type === "barbell" && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">BB</span>
              )
            )}
            {isUnilateral && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">L/R</span>
            )}
          </div>
        </div>
        <ExerciseEditButton exercise={exercise} hasSets={history.length > 0} />
      </div>

      {/* Sticky notes */}
      <ExerciseNotesSection exerciseId={exerciseId} initialNotes={notes} />

      {/* Best e1RM stat card */}
      {(bestE1RM.both || bestE1RM.left || bestE1RM.right) && (
        <Card className="p-4 mb-4 bg-blue-400/5 border-blue-400/30">
          <p className="text-xs uppercase tracking-wider text-blue-300 font-semibold mb-2">
            Best e1RM
          </p>
          {isUnilateral ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-blue-400 uppercase font-medium">Left</p>
                {bestE1RM.left ? (
                  <>
                    <p className="text-2xl font-bold">{roundE1RM(bestE1RM.left.e1rm)}</p>
                    <p className="text-xs text-muted-foreground">
                      from {bestE1RM.left.reps}×{bestE1RM.left.load}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">—</p>
                )}
              </div>
              <div>
                <p className="text-xs text-orange-400 uppercase font-medium">Right</p>
                {bestE1RM.right ? (
                  <>
                    <p className="text-2xl font-bold">{roundE1RM(bestE1RM.right.e1rm)}</p>
                    <p className="text-xs text-muted-foreground">
                      from {bestE1RM.right.reps}×{bestE1RM.right.load}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">—</p>
                )}
              </div>
            </div>
          ) : (
            bestE1RM.both && (
              <div>
                <p className="text-3xl font-bold">{roundE1RM(bestE1RM.both.e1rm)} <span className="text-sm font-normal text-muted-foreground">lbs</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  from {bestE1RM.both.reps} × {bestE1RM.both.load} on{" "}
                  {new Date(bestE1RM.both.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            )
          )}
        </Card>
      )}

      {/* Per-exercise goal */}
      <GoalCard exerciseId={exerciseId} goal={goal} currentBestE1RM={currentBestE1RM} />

      {/* Chart card with metric toggle */}
      {chartData.length >= 2 ? (
        <ExerciseChartCard isUnilateral={isUnilateral} data={chartData} />
      ) : (
        <Card className="p-4 mb-6">
          <p className="text-sm text-muted-foreground text-center">
            {chartData.length === 0
              ? "No sessions logged yet."
              : "Log at least 2 sessions to see progress charts."}
          </p>
        </Card>
      )}

      {/* Deep Dive: all-sets scatter, best RMs/schemes, plateau + trend */}
      <ExerciseDeepDive isUnilateral={isUnilateral} data={deepDive} />

      <Separator className="mb-4" />

      <h2 className="text-sm font-medium text-muted-foreground mb-3">Recent Sessions</h2>
      <div className="space-y-3">
        {history.map((session) => {
          const date = new Date(session.performedOn + "T12:00:00");
          const dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          const grouped = new Map<number, typeof session.sets>();
          for (const s of session.sets) {
            if (!grouped.has(s.setIndex)) grouped.set(s.setIndex, []);
            grouped.get(s.setIndex)!.push(s);
          }
          const setGroups = Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);

          return (
            <Card key={session.performedOn} className="p-3">
              <h3 className="text-sm font-medium mb-2">{dateStr}</h3>
              <div className="space-y-1">
                {setGroups.map(([index, sets]) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <span className="text-xs text-muted-foreground font-mono w-6">#{index}</span>
                    {isUnilateral ? (
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        {sets.map((s, i) => (
                          <span key={i} className={s.side === "left" ? "text-blue-400" : "text-orange-400"}>
                            {s.side[0].toUpperCase()}: {s.reps}x{s.load}
                            {s.rpe && <span className="text-muted-foreground"> @{s.rpe}</span>}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span>
                        {sets[0].reps} x {sets[0].load} lbs
                        {sets[0].rpe && <span className="text-muted-foreground"> @ RPE {sets[0].rpe}</span>}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
