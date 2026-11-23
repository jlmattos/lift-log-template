"use client";

import { Card } from "@/components/ui/card";
import { SetLogger } from "@/components/set-logger";
import { InlineExerciseNotes } from "@/components/inline-exercise-notes";
import { summarizeSession } from "@/lib/format";
import { resolveBar } from "@/lib/barbell";
import { formatSeconds } from "@/lib/groups";

type SetData = {
  id: string;
  set_index: number;
  side: string;
  reps: number;
  load: number;
  rpe: number | null;
};

type ExerciseData = {
  id: string;
  name: string;
  is_unilateral: boolean;
  equipment_type?: string;
  equipment?: { name: string; bar_weight: number | string } | null;
};

type LastSession = {
  performedOn: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sets: any[];
} | null;

type PRFlags = { both?: boolean; left?: boolean; right?: boolean };

function relativeDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * One exercise in the Today workout, rendered as a collapsible card. Tapping the
 * header expands the full SetLogger inline (no page navigation), and multiple
 * cards can be open at once — built for supersets where you bounce between lifts.
 *
 * Completion: an exercise with a prescribed set count auto-turns green once the
 * count is hit; an exercise with no target can be marked done manually.
 */
export function ExerciseAccordionItem({
  exercise,
  sets,
  setRoundsCount,
  targetSets,
  targetReps,
  workoutId,
  pr,
  lastSession,
  expanded,
  onToggle,
  manualDone,
  onToggleManualDone,
  workoutCompleted,
  onSwap,
  onOptimisticLog,
  onOptimisticRollback,
  timedSeconds = null,
  restSeconds = null,
  onLogged,
  inGroup = false,
}: {
  exercise: ExerciseData;
  sets: SetData[];
  setRoundsCount: number;
  targetSets: number | null;
  targetReps: string | null;
  workoutId: string;
  pr?: PRFlags;
  lastSession?: LastSession;
  expanded: boolean;
  onToggle: () => void;
  manualDone: boolean;
  onToggleManualDone: () => void;
  workoutCompleted: boolean;
  /** Swap this (not-yet-started) exercise out of today's session. */
  onSwap?: () => void;
  /** Optimistic logging: paint sets instantly, roll back on failure. The
   *  rollback message is surfaced by TodayView (this card may have
   *  auto-collapsed, unmounting the logger that would otherwise show it). */
  onOptimisticLog?: (rows: SetData[]) => void;
  onOptimisticRollback?: (ids: string[], message?: string) => void;
  /** Template timed_seconds (opens the set timer by default). */
  timedSeconds?: number | null;
  /** Template rest_seconds — shown as a chip; the Today page runs the timer. */
  restSeconds?: number | null;
  /** A set was just submitted (optimistic) — Today starts rest / advances. */
  onLogged?: (setIndex: number) => void;
  /** Rendered inside a superset/tri-set block: flatter card, no own border. */
  inGroup?: boolean;
}) {
  const hasTarget = targetSets != null;
  const targetMet = hasTarget && setRoundsCount >= targetSets;
  const isComplete = targetMet || manualDone;
  const started = sets.length > 0;
  const hasPR = !!(pr && (pr.both || pr.left || pr.right));

  const accent = hasPR
    ? "border-amber-400/40 bg-amber-400/5"
    : isComplete
      ? "border-emerald-400/50 bg-emerald-400/5"
      : started
        ? "border-blue-400/40"
        : "border-dashed";

  const targetStr =
    hasTarget || targetReps ? `${targetSets ?? "?"} × ${targetReps ?? "?"}` : null;
  const summary = started ? summarizeSession(sets, exercise.is_unilateral) : null;
  const progressStr = hasTarget
    ? `${setRoundsCount}/${targetSets}`
    : started
      ? `${setRoundsCount} set${setRoundsCount !== 1 ? "s" : ""}`
      : null;

  // Inside a block the group container carries the frame; members get a
  // thin left-edge status stripe instead of a full border.
  const groupAccent = hasPR
    ? "border-l-amber-400/70 bg-amber-400/5"
    : isComplete
      ? "border-l-emerald-400/70 bg-emerald-400/5"
      : started
        ? "border-l-blue-400/70"
        : "border-l-border";

  return (
    <Card
      className={
        inGroup
          ? `overflow-hidden transition-colors rounded-none border-0 border-l-2 shadow-none bg-transparent ${groupAccent}`
          : `overflow-hidden transition-colors ${accent}`
      }
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-accent/40 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5">
          {/* Status dot / check */}
          <span className="shrink-0 text-base leading-none w-4 text-center">
            {isComplete ? (
              <span className="text-emerald-400">✓</span>
            ) : started ? (
              <span className="text-blue-400">●</span>
            ) : (
              <span className="text-muted-foreground/40">○</span>
            )}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={`font-medium ${
                  isComplete ? "text-emerald-200" : !started ? "text-muted-foreground" : ""
                }`}
              >
                {exercise.name}
              </h3>
              {hasPR && (
                <span className="text-xs bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded font-medium">
                  🏆 PR
                  {pr!.left && !pr!.right && " (L)"}
                  {pr!.right && !pr!.left && " (R)"}
                </span>
              )}
            </div>
            <div className="flex gap-1 mt-0.5 items-center flex-wrap">
              {exercise.equipment ? (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {exercise.equipment.name}
                </span>
              ) : (
                exercise.equipment_type === "barbell" && (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">BB</span>
                )
              )}
              {exercise.is_unilateral && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">L/R</span>
              )}
              {targetStr && (
                <span className="text-xs text-blue-300 bg-blue-400/10 px-1.5 py-0.5 rounded font-mono">
                  Target: {targetStr}
                </span>
              )}
              {timedSeconds != null && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                  ⏱ {formatSeconds(timedSeconds)}
                </span>
              )}
              {restSeconds != null && !inGroup && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                  rest {formatSeconds(restSeconds)}
                </span>
              )}
            </div>
          </div>

          {progressStr && (
            <span
              className={`text-xs font-mono shrink-0 ${
                isComplete ? "text-emerald-300" : "text-muted-foreground"
              }`}
            >
              {progressStr}
            </span>
          )}

          {/* Chevron */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-muted-foreground shrink-0 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>

        {/* Collapsed summary line */}
        {!expanded && summary && (
          <p className="text-sm text-muted-foreground mt-2 pl-6.5 truncate">{summary}</p>
        )}
        {!expanded && !started && lastSession && !workoutCompleted && (
          <p className="text-xs text-muted-foreground/70 font-mono mt-2 truncate">
            Last · {relativeDate(lastSession.performedOn)}:{" "}
            {summarizeSession(lastSession.sets, exercise.is_unilateral)}
          </p>
        )}
      </button>

      {/* Expanded: full inline logger */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/40 pt-3">
          <SetLogger
            workoutId={workoutId}
            exerciseId={exercise.id}
            isUnilateral={exercise.is_unilateral}
            bar={resolveBar(exercise)}
            existingSets={sets}
            lastSets={lastSession?.sets ?? []}
            lastSession={lastSession ?? undefined}
            onOptimisticLog={onOptimisticLog}
            onOptimisticRollback={onOptimisticRollback}
            timedSeconds={timedSeconds}
            onLogged={onLogged}
          />

          {/* Sticky notes — form cues, mods, warnings (lazy-loaded) */}
          <InlineExerciseNotes exerciseId={exercise.id} />

          {/* Manual completion for exercises with no prescribed set count */}
          {!hasTarget && !workoutCompleted && (
            <button
              type="button"
              onClick={onToggleManualDone}
              className={`w-full mt-3 h-10 rounded-md text-sm font-medium border transition-colors ${
                manualDone
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {manualDone ? "✓ Done — tap to undo" : "Mark exercise done"}
            </button>
          )}

          {/* Swap — only before any set is logged (one-time, this workout only) */}
          {onSwap && !started && !workoutCompleted && (
            <button
              type="button"
              onClick={onSwap}
              className="w-full mt-2 h-10 rounded-md text-sm font-medium border border-dashed border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              ↔ Swap this exercise for today
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
