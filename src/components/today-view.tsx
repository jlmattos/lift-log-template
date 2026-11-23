"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AddExerciseSheet } from "@/components/add-exercise-sheet";
import { ExerciseAccordionItem } from "@/components/exercise-accordion-item";
import { listTemplates, startWorkoutFromTemplate } from "@/actions/templates";
import { skipRoutineDay } from "@/actions/routines";
import { finishWorkout, unfinishWorkout } from "@/actions/workouts";
import { summarizeSession } from "@/lib/format";
import type { PlanEntry } from "@/actions/workouts";
import { deriveGroups, formatSeconds } from "@/lib/groups";
import { RestTimerBar } from "@/components/rest-timer-bar";
import { TimerSettingsSheet } from "@/components/timer-settings-sheet";
import { useTimerSettings } from "@/lib/timer-settings";
import {
  adjustRestTimer,
  clearRestTimer,
  startRestTimer,
  useRestTimer,
} from "@/lib/rest-timer-store";

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
};

type PRFlags = { both?: boolean; left?: boolean; right?: boolean };

type CardioTemplateLite = { id: string; name: string; prescription_notes: string | null } | null;

type RoutineNext = {
  routine: { id: string; name: string; weeks: number };
  next: {
    weekNumber: number;
    dayNumber: number;
    template: { id: string; name: string } | null;
    exercises?: ExerciseData[];
    // Cardio next-workout fields (next can be a cardio day, not just strength)
    isCardio?: boolean;
    cardioTemplateId?: string | null;
    cardioTemplate?: CardioTemplateLite;
  } | null;
  sequence?: {
    weekNumber: number;
    dayNumber: number;
    template: { id: string; name: string } | null;
    isCardio?: boolean;
    cardioTemplate?: CardioTemplateLite;
    cardioTemplateId?: string | null;
  }[];
  reason?: string;
} | null;

export function TodayView({
  data,
  routineNext,
  lastSessions,
  todaysPRs = {},
  isRestDay = false,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  routineNext: RoutineNext;
  lastSessions: Record<string, LastSession>;
  todaysPRs?: Record<string, PRFlags>;
  isRestDay?: boolean;
}) {
  const router = useRouter();
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [restAcknowledged, setRestAcknowledged] = useState(false);
  // The planned exercise currently being swapped out (null = no swap in progress).
  const [swapExerciseId, setSwapExerciseId] = useState<string | null>(null);
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [templates, setTemplates] = useState<
    { id: string; name: string; exerciseCount: number }[]
  >([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (templateSheetOpen) {
      listTemplates().then(setTemplates);
    }
  }, [templateSheetOpen]);

  function handlePickTemplate(templateId: string) {
    startTransition(async () => {
      await startWorkoutFromTemplate(templateId);
      setTemplateSheetOpen(false);
      router.refresh();
    });
  }

  function handleStartNext() {
    const tpl = routineNext?.next?.template;
    if (!tpl) return;
    startTransition(async () => {
      await startWorkoutFromTemplate(tpl.id);
      router.refresh();
    });
  }

  function handlePickFromRoutine(templateId: string) {
    startTransition(async () => {
      await startWorkoutFromTemplate(templateId);
      router.refresh();
    });
  }

  function handleSkipNext() {
    const nxt = routineNext?.next;
    if (!nxt || !routineNext?.routine) return;
    const target = nxt.isCardio
      ? { cardioTemplateId: nxt.cardioTemplateId }
      : { templateId: nxt.template?.id };
    if (!target.templateId && !target.cardioTemplateId) return;
    startTransition(async () => {
      try {
        await skipRoutineDay(routineNext.routine.id, target);
        setConfirmSkip(false);
        router.refresh();
      } catch (e) {
        setSkipError(e instanceof Error ? e.message : "Couldn't record the skip");
      }
    });
  }

  // ── Optimistic set logging ──────────────────────────────────────────────
  // Sets the user just logged, painted immediately while the server action +
  // router.refresh() run in the background. Each pending row is dropped as
  // soon as fresh server data contains it (matched by exercise + set_index +
  // side); rows whose action failed are rolled back by the SetLogger.
  type PendingSet = SetData & { exerciseId: string };
  const [pendingSets, setPendingSets] = useState<PendingSet[]>([]);
  const [prevData, setPrevData] = useState(data);
  if (prevData !== data) {
    setPrevData(data);
    if (pendingSets.length > 0) {
      const serverKeys = new Set<string>();
      for (const { exercise, sets } of (data?.exercises ?? []) as { exercise: ExerciseData; sets: SetData[] }[]) {
        for (const s of sets) serverKeys.add(`${exercise.id}|${s.set_index}|${s.side}`);
      }
      const remaining = pendingSets.filter(
        (p) => !serverKeys.has(`${p.exerciseId}|${p.set_index}|${p.side}`)
      );
      if (remaining.length !== pendingSets.length) setPendingSets(remaining);
    }
  }
  const pendingFor = (exId: string) => pendingSets.filter((p) => p.exerciseId === exId);

  // Failed-save banner lives HERE, not in SetLogger: logging the final set of
  // a target auto-collapses the card and unmounts the logger mid-flight, so a
  // logger-local error would be silently discarded exactly when it matters.
  const [logFailure, setLogFailure] = useState<string | null>(null);

  function addPendingSets(exerciseId: string, rows: SetData[]) {
    setLogFailure(null);
    setPendingSets((prev) => [...prev, ...rows.map((r) => ({ ...r, exerciseId }))]);
  }
  function rollbackPendingSets(ids: string[], message?: string) {
    setPendingSets((prev) => prev.filter((p) => !ids.includes(p.id)));
    if (message) setLogFailure(message);
  }

  const workoutId = data?.workout?.id;
  const plannedExercises = data?.template?.plannedExercises ?? [];
  const templateName = data?.template?.name;
  const targetsByExercise: Record<string, PlanEntry> =
    data?.template?.targetsByExercise ?? {};
  const NO_PLAN: PlanEntry = {
    targetSets: null,
    targetReps: null,
    position: Number.MAX_SAFE_INTEGER,
    block: null,
    restSeconds: null,
    timedSeconds: null,
  };

  // Rest-day handling: on a scheduled rest day we lead with a rest-day card.
  // "Skip rest day" reveals the normal Up Next suggestion; "Take rest day"
  // acknowledges it (session-only, no persistence).
  const [skipRest, setSkipRest] = useState(false);
  const showRestCard = isRestDay && !skipRest && !restAcknowledged;

  // Show routine suggestion when no workout exists — but on a rest day, only
  // after the user chooses to skip the rest.
  const showRoutineSuggestion = !data && routineNext && (!isRestDay || skipRest);
  const [showAllDays, setShowAllDays] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);

  // Which exercise cards are expanded (multiple allowed — built for supersets),
  // and which no-target exercises the user has manually marked done. Both are
  // in-memory: they persist across the log→router.refresh() cycle (client state
  // isn't unmounted), and reset on a hard page reload (target-based green
  // recomputes from data, manual flags clear).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [manualDoneIds, setManualDoneIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleManualDone(id: string) {
    setManualDoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Build unified, status-sorted exercise list (only when workout exists)
  type ExerciseRowData = {
    exercise: ExerciseData;
    sets: SetData[];
    setRoundsCount: number; // distinct set_index count
    targetSets: number | null;
    targetReps: string | null;
    status: "active" | "not_started" | "done";
    /** Template row (null for an exercise added ad hoc today). */
    plan: PlanEntry | null;
  };

  const sortedExercises: ExerciseRowData[] = [];
  if (data) {
    // Logged exercises (have sets) — server sets plus any still-pending
    // optimistic ones.
    for (const { exercise, sets } of data.exercises as { exercise: ExerciseData; sets: SetData[] }[]) {
      const plan = targetsByExercise[exercise.id] ?? null;
      const targets = plan ?? NO_PLAN;
      const merged = [...sets, ...pendingFor(exercise.id)];
      const rounds = new Set(merged.map((s) => s.set_index)).size;
      let status: "active" | "done" = "active";
      if (targets.targetSets && rounds >= targets.targetSets) status = "done";
      sortedExercises.push({
        exercise,
        sets: merged,
        setRoundsCount: rounds,
        targetSets: targets.targetSets,
        targetReps: targets.targetReps,
        status,
        plan,
      });
    }
    // Planned exercises (template exercises with 0 sets logged today). A
    // pending optimistic set makes one "started" before the server catches up.
    for (const ex of plannedExercises as ExerciseData[]) {
      const plan = targetsByExercise[ex.id] ?? null;
      const targets = plan ?? NO_PLAN;
      const pend = pendingFor(ex.id);
      const rounds = new Set(pend.map((s) => s.set_index)).size;
      sortedExercises.push({
        exercise: ex,
        sets: pend,
        setRoundsCount: rounds,
        targetSets: targets.targetSets,
        targetReps: targets.targetReps,
        plan,
        status:
          rounds === 0
            ? "not_started"
            : targets.targetSets && rounds >= targets.targetSets
              ? "done"
              : "active",
      });
    }
  }

  // ── Template order + groups ─────────────────────────────────────────────
  // Render in template position order (logged-first sorting would tear a
  // superset apart mid-workout). Ad-hoc exercises follow, in logging order.
  const adHocBase = 1_000_000;
  const orderedRows = sortedExercises
    .map((row, i) => ({
      row,
      position: row.plan ? row.plan.position : adHocBase + i,
      block: row.plan?.block ?? null,
      restSeconds: row.plan?.restSeconds ?? null,
    }))
    .sort((a, b) => a.position - b.position);
  const groups = deriveGroups(orderedRows);
  const renderOrder: ExerciseRowData[] = orderedRows.map((o) => o.row);
  const groupByExerciseId = new Map<string, (typeof groups)[number]>();
  for (const g of groups) {
    if (g.members.length >= 2) for (const m of g.members) groupByExerciseId.set(m.row.exercise.id, g);
  }

  // ── Rest timer + superset auto-advance ─────────────────────────────────
  const timerSettings = useTimerSettings();
  const restTimer = useRestTimer(workoutId);
  const [timerSettingsOpen, setTimerSettingsOpen] = useState(false);

  function revealExercise(id: string) {
    setExpandedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // Let the expansion paint, then bring the card into view.
    setTimeout(() => {
      document.getElementById(`exercise-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  /**
   * A set was just submitted for `exerciseId` (its new set_index is
   * `setIndex`). Decide what's next and whether to rest:
   *  - solo lift, more sets to go → rest, same lift
   *  - superset member with a partner still to do this round → no rest,
   *    open the partner ("go straight")
   *  - last member of the round → group rest, open the first member again
   *  - lift finished → rest, open the next unfinished lift in order
   */
  function handleLogged(exerciseId: string, setIndex: number) {
    if (!workoutId) return;
    const idx = renderOrder.findIndex((e) => e.exercise.id === exerciseId);
    if (idx < 0) return;
    const me = renderOrder[idx];
    const roundsAfter = Math.max(setIndex, me.setRoundsCount + 1);
    const willBeDone = (e: ExerciseRowData) =>
      e.exercise.id === exerciseId
        ? e.targetSets != null && roundsAfter >= e.targetSets
        : e.status === "done";
    const defaultRest = timerSettings.defaultRestSeconds;
    const group = groupByExerciseId.get(exerciseId);

    let next: ExerciseRowData | undefined;
    let restSec = 0;
    let label = "";

    if (group) {
      const members = group.members.map((m) => m.row);
      const mi = members.findIndex((m) => m.exercise.id === exerciseId);
      const later = members.slice(mi + 1).find((m) => !willBeDone(m));
      if (later) {
        // Go straight to the partner — no rest inside a round.
        next = later;
      } else {
        const roundsDone = Math.min(
          ...members.map((m) => (m.exercise.id === exerciseId ? roundsAfter : m.setRoundsCount))
        );
        const again = members.find((m) => !willBeDone(m));
        restSec = group.restSeconds ?? me.plan?.restSeconds ?? defaultRest;
        if (again) {
          next = again;
          label = `Round ${roundsDone + 1} · ${again.exercise.name}`;
        } else {
          const lastIdx = renderOrder.findIndex(
            (e) => e.exercise.id === members[members.length - 1].exercise.id
          );
          next = renderOrder.slice(lastIdx + 1).find((e) => !willBeDone(e));
          label = next ? next.exercise.name : "Done — end workout when ready";
        }
      }
    } else {
      restSec = me.plan?.restSeconds ?? defaultRest;
      if (!willBeDone(me)) {
        next = me;
        label = `${me.exercise.name} · set ${roundsAfter + 1}`;
      } else {
        next = renderOrder.slice(idx + 1).find((e) => !willBeDone(e));
        label = next ? next.exercise.name : "Done — end workout when ready";
      }
    }

    if (next && next.exercise.id !== exerciseId) revealExercise(next.exercise.id);
    if (restSec > 0 && timerSettings.autoRest && !workoutCompleted) {
      startRestTimer(workoutId, restSec, label);
    }
  }

  // Auto-collapse an exercise the moment it hits its prescribed set count.
  // We watch for the target-complete TRANSITION (not just "is complete") so the
  // card collapses once after you log the final set, but you can still manually
  // re-expand a completed exercise and have it stay open. Tracked during render
  // via previous-value comparison (React's sanctioned alternative to an effect).
  const completeIds = sortedExercises.filter((e) => e.status === "done").map((e) => e.exercise.id);
  const completeKey = completeIds.slice().sort().join(",");
  const [prevCompleteKey, setPrevCompleteKey] = useState(completeKey);
  if (completeKey !== prevCompleteKey) {
    const prevSet = new Set(prevCompleteKey ? prevCompleteKey.split(",") : []);
    const newlyComplete = completeIds.filter((id) => !prevSet.has(id));
    setPrevCompleteKey(completeKey);
    if (newlyComplete.length > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const id of newlyComplete) next.delete(id);
        return next;
      });
    }
  }

  function handleFinish() {
    if (!workoutId || confirmedSets === 0) return;
    startTransition(async () => {
      await finishWorkout(workoutId);
      router.push("/progress");
    });
  }

  function handleUnfinish() {
    if (!workoutId) return;
    startTransition(async () => {
      await unfinishWorkout(workoutId);
      router.refresh();
    });
  }

  const workoutCompleted = !!data?.workout?.completed_at;
  const totalSets = data ? sortedExercises.reduce((s, e) => s + e.sets.length, 0) : 0;
  // Server-confirmed sets only — gates End Workout so a workout can't be
  // finished on the strength of an optimistic set that later fails to save.
  const confirmedSets = data
    ? (data.exercises as { sets: SetData[] }[]).reduce((s, e) => s + e.sets.length, 0)
    : 0;
  // If a rollback (or reload) hides the End Workout block mid-confirmation,
  // drop the confirm state so the dialog can't resurrect unrequested later.
  if (confirmFinish && (!data || confirmedSets === 0 || workoutCompleted)) {
    setConfirmFinish(false);
  }

  // Label for the next workout (cardio or strength), used in the rest-day card.
  const nextLabel = routineNext?.next
    ? routineNext.next.isCardio
      ? routineNext.next.cardioTemplate?.name ?? "Cardio"
      : routineNext.next.template?.name ?? "next workout"
    : null;

  return (
    <div className="mt-6 space-y-3">
      {/* Scheduled rest day: lead with skip / take options */}
      {showRestCard && (
        <Card className="p-4 border-emerald-400/40 bg-emerald-400/5 border-2">
          <p className="text-xs uppercase tracking-wider text-emerald-300 font-medium">
            🌿 Scheduled rest day
          </p>
          <p className="text-sm text-foreground/80 mt-1">
            Today&apos;s a rest day in {routineNext?.routine.name ?? "your routine"}. Recover — or train anyway if you&apos;re feeling it.
          </p>
          <div className="grid grid-cols-1 gap-2 mt-3">
            {nextLabel && (
              <Button onClick={() => setSkipRest(true)} disabled={isPending}>
                ▶ Skip rest — do {nextLabel}
              </Button>
            )}
            <Button
              onClick={() => setRestAcknowledged(true)}
              disabled={isPending}
              variant="outline"
            >
              🌿 Take rest day
            </Button>
          </div>
        </Card>
      )}

      {/* Rest acknowledged for the session */}
      {isRestDay && restAcknowledged && !skipRest && (
        <Card className="p-4 border-emerald-400/30 bg-emerald-400/5">
          <p className="text-sm text-emerald-300 font-medium">🌿 Resting today ✓</p>
          <button
            onClick={() => setRestAcknowledged(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            Changed your mind? Train instead
          </button>
        </Card>
      )}

      {/* Active routine: suggest next workout in sequence (when no workout exists yet) */}
      {showRoutineSuggestion && routineNext.next && (
        <Card className="p-4 border-blue-400/40 bg-blue-400/5 border-2">
          <div className="mb-2">
            <p className="text-xs uppercase tracking-wider text-blue-300 font-medium">
              Up Next{routineNext.next.isCardio ? " · Cardio" : ""}
            </p>
            <h2 className="text-lg font-bold mt-1">
              {routineNext.next.isCardio
                ? routineNext.next.cardioTemplate?.name ?? "Cardio"
                : routineNext.next.template?.name ?? "Workout"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {routineNext.routine.name} · Week {routineNext.next.weekNumber}, Day {routineNext.next.dayNumber}
            </p>
          </div>

          {/* Cardio prescription preview */}
          {routineNext.next.isCardio && routineNext.next.cardioTemplate?.prescription_notes && (
            <div className="mt-3 pt-3 border-t border-blue-400/20">
              <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {routineNext.next.cardioTemplate.prescription_notes}
              </p>
            </div>
          )}

          {/* Exercise preview */}
          {routineNext.next.exercises && routineNext.next.exercises.length > 0 && (
            <div className="mt-3 pt-3 border-t border-blue-400/20">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                {routineNext.next.exercises.length} exercises
              </p>
              <ol className="space-y-1">
                {routineNext.next.exercises.map((ex, idx) => {
                  const last = lastSessions[ex.id];
                  const lastStr = last
                    ? summarizeSession(last.sets, ex.is_unilateral)
                    : null;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const exAny = ex as any;
                  const targetStr =
                    exAny.targetSets || exAny.targetReps
                      ? `${exAny.targetSets ?? "?"}×${exAny.targetReps ?? "?"}`
                      : null;
                  return (
                    <li key={ex.id} className="flex items-baseline gap-2 text-sm">
                      <span className="text-xs text-muted-foreground/60 font-mono w-4 shrink-0">
                        {idx + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span>{ex.name}</span>
                          {targetStr && (
                            <span className="text-xs text-blue-300 font-mono">
                              {targetStr}
                            </span>
                          )}
                          {ex.equipment ? (
                            <span className="text-[10px] text-muted-foreground bg-muted/60 px-1 py-0.5 rounded">
                              {ex.equipment.name}
                            </span>
                          ) : (
                            ex.equipment_type === "barbell" && (
                              <span className="text-[10px] text-muted-foreground bg-muted/60 px-1 py-0.5 rounded">BB</span>
                            )
                          )}
                          {ex.is_unilateral && (
                            <span className="text-[10px] text-muted-foreground bg-muted/60 px-1 py-0.5 rounded">L/R</span>
                          )}
                        </div>
                        {lastStr && (
                          <span className="text-xs text-muted-foreground/70 font-mono block">
                            Last: {lastStr}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-2 mt-2">
            {routineNext.next.isCardio && routineNext.next.cardioTemplateId ? (
              <Link
                href={`/cardio/log/${routineNext.next.cardioTemplateId}`}
                className="inline-flex items-center justify-center h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 hover:bg-primary/90 transition-colors"
              >
                ▶ Log Cardio
              </Link>
            ) : (
              <Button onClick={handleStartNext} disabled={isPending}>
                ▶ Start Workout
              </Button>
            )}
            <Button
              onClick={() => { setSkipError(null); setConfirmSkip(true); }}
              disabled={isPending}
              variant="outline"
              className="px-3"
              title="Skip this day"
            >
              Skip
            </Button>
          </div>

          {confirmSkip && (
            <div className="mt-2 space-y-2 p-3 border border-amber-400/30 bg-amber-400/5 rounded-md">
              <p className="text-xs text-amber-200">
                Skip <strong>{nextLabel ?? "this session"}</strong>? The next day in your routine will be suggested.
              </p>
              {skipError && <p className="text-xs text-red-300">{skipError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmSkip(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSkipNext}
                  disabled={isPending}
                  size="sm"
                  className="flex-1 bg-amber-400 text-background hover:bg-amber-500"
                >
                  {isPending ? "Skipping..." : "Yes, skip"}
                </Button>
              </div>
            </div>
          )}

          {routineNext.sequence && routineNext.sequence.length > 1 && (
            <>
              <button
                onClick={() => setShowAllDays((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-3 w-full text-center"
              >
                {showAllDays ? "Hide other days" : "Or pick a different day…"}
              </button>
              {showAllDays && (
                <div className="mt-2 space-y-1">
                  {routineNext.sequence.map((slot) => {
                    const isNext =
                      slot.weekNumber === routineNext.next!.weekNumber &&
                      slot.dayNumber === routineNext.next!.dayNumber;
                    const slotName = slot.isCardio
                      ? slot.cardioTemplate?.name ?? "Cardio"
                      : slot.template?.name ?? "Workout";
                    // Strength slots start a workout from template; cardio slots
                    // route to the cardio log page.
                    const go = () => {
                      if (slot.isCardio && slot.cardioTemplateId) {
                        router.push(`/cardio/log/${slot.cardioTemplateId}`);
                      } else if (slot.template) {
                        handlePickFromRoutine(slot.template.id);
                      }
                    };
                    return (
                      <button
                        key={`${slot.weekNumber}-${slot.dayNumber}`}
                        onClick={go}
                        disabled={isPending}
                        className={`w-full text-left p-2 rounded-md text-xs transition-colors ${
                          isNext
                            ? "bg-blue-400/15 text-blue-300"
                            : "hover:bg-accent/50 text-muted-foreground"
                        }`}
                      >
                        <span className="font-mono text-muted-foreground/70">
                          W{slot.weekNumber}D{slot.dayNumber}
                        </span>{" "}
                        {slot.isCardio ? "🏃 " : ""}{slotName}
                        {isNext && " · suggested"}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {showRoutineSuggestion && !routineNext.next && (
        <Card className="p-4 border-muted bg-muted/20">
          <p className="text-sm text-muted-foreground">
            {routineNext.reason ?? "No workouts scheduled in your active routine."}
          </p>
        </Card>
      )}

      {data && (
        <div className="mb-2 flex items-center gap-2">
          {templateName ? (
            <p className="flex-1 min-w-0 truncate">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Template:
              </span>{" "}
              <span className="text-sm font-medium">{templateName}</span>
            </p>
          ) : (
            <span className="flex-1" />
          )}
          <button
            type="button"
            onClick={() => setTimerSettingsOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-2 py-1 shrink-0"
            aria-label="Timer settings"
          >
            ⏱ Timers
          </button>
        </div>
      )}

      {/* A set failed to save in the background — shown here because the
          card that logged it may have auto-collapsed (unmounting its logger) */}
      {logFailure && (
        <Card className="p-3 border-red-400/40 bg-red-400/10">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-red-200">⚠ {logFailure}</p>
            <button
              onClick={() => setLogFailure(null)}
              className="text-xs text-red-300/70 hover:text-red-200 shrink-0"
            >
              Dismiss
            </button>
          </div>
        </Card>
      )}

      {/* Exercise list — template order; supersets/tri-sets render as one
          bracketed block with a round counter, solo lifts as plain cards */}
      {data && sortedExercises.length > 0 && (
        <div className="space-y-2">
          {groups.map((g) => {
            const renderItem = (e: ExerciseRowData, inGroup: boolean) => (
              <div key={e.exercise.id} id={`exercise-${e.exercise.id}`} className="scroll-mt-4">
                <ExerciseAccordionItem
                  exercise={e.exercise}
                  sets={e.sets}
                  setRoundsCount={e.setRoundsCount}
                  targetSets={e.targetSets}
                  targetReps={e.targetReps}
                  workoutId={data.workout.id}
                  pr={todaysPRs[e.exercise.id]}
                  lastSession={lastSessions[e.exercise.id] ?? null}
                  expanded={expandedIds.has(e.exercise.id)}
                  onToggle={() => toggleExpanded(e.exercise.id)}
                  manualDone={manualDoneIds.has(e.exercise.id)}
                  onToggleManualDone={() => toggleManualDone(e.exercise.id)}
                  workoutCompleted={!!data.workout.completed_at}
                  onSwap={() => setSwapExerciseId(e.exercise.id)}
                  onOptimisticLog={(rows) => addPendingSets(e.exercise.id, rows)}
                  onOptimisticRollback={rollbackPendingSets}
                  timedSeconds={e.plan?.timedSeconds ?? null}
                  restSeconds={e.plan?.restSeconds ?? null}
                  onLogged={(setIndex) => handleLogged(e.exercise.id, setIndex)}
                  inGroup={inGroup}
                />
              </div>
            );

            if (g.members.length < 2 || !g.label) {
              return renderItem(g.members[0].row, false);
            }

            const members = g.members.map((m) => m.row);
            const roundsDone = Math.min(...members.map((m) => m.setRoundsCount));
            const targetRounds = members.reduce<number | null>(
              (acc, m) => (m.targetSets == null ? acc : Math.max(acc ?? 0, m.targetSets)),
              null
            );
            const allDone = members.every((m) => m.status === "done" || manualDoneIds.has(m.exercise.id));
            const anyStarted = members.some((m) => m.sets.length > 0);
            const anyPR = members.some((m) => {
              const pr = todaysPRs[m.exercise.id];
              return !!(pr && (pr.both || pr.left || pr.right));
            });
            const frame = anyPR
              ? "border-amber-400/40"
              : allDone
                ? "border-emerald-400/50"
                : anyStarted
                  ? "border-blue-400/40"
                  : "border-dashed border-border";
            const roundStr =
              targetRounds != null
                ? allDone
                  ? `${targetRounds}/${targetRounds} rounds`
                  : `Round ${Math.min(roundsDone + 1, targetRounds)} of ${targetRounds}`
                : anyStarted
                  ? `${roundsDone} round${roundsDone !== 1 ? "s" : ""}`
                  : null;

            return (
              <div key={g.key} className={`rounded-xl border-2 overflow-hidden ${frame}`}>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 border-b border-border/40">
                  <span className="font-mono text-xs font-bold w-5 h-5 rounded bg-foreground/10 flex items-center justify-center">
                    {g.label}
                  </span>
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    {g.kind}
                  </span>
                  {g.restSeconds != null && (
                    <span className="text-xs text-muted-foreground font-mono">
                      · rest {formatSeconds(g.restSeconds)}
                    </span>
                  )}
                  <span className="flex-1" />
                  {roundStr && (
                    <span
                      className={`text-xs font-mono ${allDone ? "text-emerald-300" : "text-muted-foreground"}`}
                    >
                      {roundStr}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-border/40">
                  {members.map((m) => renderItem(m, true))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Workout complete banner */}
      {workoutCompleted && (
        <Card className="p-4 border-emerald-400/40 bg-emerald-400/5 border-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-emerald-300 font-semibold">
                Workout Complete ✓
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {sortedExercises.length} exercises · {totalSets} sets
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnfinish}
              disabled={isPending}
            >
              Reopen
            </Button>
          </div>
        </Card>
      )}

      {/* Actions */}
      <div className="pt-2 space-y-2">
        {!data && !showRoutineSuggestion && (
          <Button
            onClick={() => setTemplateSheetOpen(true)}
            variant="outline"
            className="w-full h-12 border-dashed text-muted-foreground"
          >
            ▶ Start from Template
          </Button>
        )}
        {!data && showRoutineSuggestion && (
          <Button
            onClick={() => setTemplateSheetOpen(true)}
            variant="ghost"
            className="w-full h-10 text-muted-foreground text-sm"
          >
            Or start from a different template
          </Button>
        )}

        {!workoutCompleted && (
          <Button
            onClick={() => setAddSheetOpen(true)}
            variant="outline"
            className="w-full h-12 border-dashed text-muted-foreground"
          >
            + Add Exercise
          </Button>
        )}

        {/* End Workout — only shown when a workout exists with at least 1
            server-confirmed set (pending optimistic sets don't count) */}
        {data && confirmedSets > 0 && !workoutCompleted && (
          <>
            {!confirmFinish ? (
              <Button
                onClick={() => setConfirmFinish(true)}
                disabled={isPending}
                className="w-full h-12 bg-emerald-500 text-background hover:bg-emerald-600 font-semibold"
              >
                ✓ End Workout
              </Button>
            ) : (
              <div className="p-3 border border-emerald-400/30 bg-emerald-400/5 rounded-md space-y-2">
                <p className="text-sm">End workout? You can reopen it later if you forgot something.</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmFinish(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleFinish}
                    disabled={isPending}
                    size="sm"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-background"
                  >
                    {isPending ? "Ending..." : "Yes, end"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {restTimer && !workoutCompleted && (
        <RestTimerBar
          timer={restTimer}
          onAdjust={adjustRestTimer}
          onDismiss={clearRestTimer}
        />
      )}
      <TimerSettingsSheet open={timerSettingsOpen} onOpenChange={setTimerSettingsOpen} />

      <AddExerciseSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        workoutId={workoutId}
      />

      {/* Swap sheet — reuses the picker; records a per-workout skip of the
          swapped-out exercise before logging the replacement. */}
      <AddExerciseSheet
        open={swapExerciseId !== null}
        onOpenChange={(o) => { if (!o) setSwapExerciseId(null); }}
        workoutId={workoutId}
        swapOutExerciseId={swapExerciseId ?? undefined}
      />

      <Sheet open={templateSheetOpen} onOpenChange={setTemplateSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Start from Template</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {templates.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No templates yet.{" "}
                <Link href="/templates" className="underline">
                  Create one
                </Link>
                .
              </p>
            )}
            {templates.map((t) => (
              <Card
                key={t.id}
                className="p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handlePickTemplate(t.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{t.name}</span>
                    <p className="text-xs text-muted-foreground">
                      {t.exerciseCount} exercise{t.exerciseCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {isPending && <span className="text-xs">...</span>}
                </div>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
