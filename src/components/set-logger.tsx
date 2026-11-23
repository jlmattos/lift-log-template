"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { logBilateralSet, logUnilateralSet } from "@/actions/sets";
import { PlateDisplay } from "@/components/plate-display";
import type { BarInfo } from "@/lib/barbell";
import { EditSetSheet } from "@/components/edit-set-sheet";
import { NumberField } from "@/components/number-field";
import { sessionCellsByIndex, parseRpe } from "@/lib/format";
import { SetTimer } from "@/components/set-timer";
import { unlockAudio } from "@/lib/timer-audio";

type SetData = {
  id: string;
  set_index: number;
  side: string;
  reps: number;
  load: number;
  rpe: number | null;
};

function getDefaults(lastSets: SetData[], isUnilateral: boolean) {
  if (!lastSets.length) {
    return isUnilateral
      ? { left: { reps: "", load: "", rpe: "" }, right: { reps: "", load: "", rpe: "" } }
      : { reps: "", load: "", rpe: "" };
  }

  if (isUnilateral) {
    const left = lastSets.find((s) => s.side === "left");
    const right = lastSets.find((s) => s.side === "right");
    return {
      left: {
        reps: left?.reps?.toString() ?? "",
        load: left?.load?.toString() ?? "",
        rpe: left?.rpe?.toString() ?? "",
      },
      right: {
        reps: right?.reps?.toString() ?? "",
        load: right?.load?.toString() ?? "",
        rpe: right?.rpe?.toString() ?? "",
      },
    };
  }

  const last = lastSets[0];
  return {
    reps: last.reps?.toString() ?? "",
    load: last.load?.toString() ?? "",
    rpe: last.rpe?.toString() ?? "",
  };
}

function groupSets(sets: SetData[]) {
  const grouped = new Map<number, SetData[]>();
  for (const s of sets) {
    if (!grouped.has(s.set_index)) grouped.set(s.set_index, []);
    grouped.get(s.set_index)!.push(s);
  }
  return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
}

type LastSession = {
  performedOn: string;
  sets: SetData[];
  /** The session before the last one (when available) — shown alongside it. */
  prior?: { performedOn: string; sets: SetData[] } | null;
} | null;

export function SetLogger({
  workoutId,
  exerciseId,
  isUnilateral,
  bar,
  existingSets,
  lastSets,
  lastSession,
  onOptimisticLog,
  onOptimisticRollback,
  timedSeconds = null,
  onLogged,
}: {
  workoutId: string;
  exerciseId: string;
  isUnilateral: boolean;
  /** The bar this exercise is loaded on (drives plate math); null = none. */
  bar: BarInfo | null;
  existingSets: SetData[];
  lastSets: SetData[];
  lastSession?: LastSession;
  /** When provided, logging paints instantly (optimistic) and syncs in the
   *  background; without them the button waits for the server round-trip.
   *  Rollback carries the failure message — the parent surfaces it, since
   *  this logger may already be unmounted (auto-collapse) when it fires. */
  onOptimisticLog?: (rows: SetData[]) => void;
  onOptimisticRollback?: (ids: string[], message?: string) => void;
  /** Template timed_seconds — when set, the set timer opens by default. */
  timedSeconds?: number | null;
  /** Fires the moment a set is submitted (before the server confirms) —
   *  the Today page uses it to start the rest timer / advance a superset. */
  onLogged?: (setIndex: number) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [logError, setLogError] = useState<string | null>(null);
  const optimistic = !!onOptimisticLog;
  const defaults = getDefaults(lastSets, isUnilateral);

  // Bilateral state
  const [reps, setReps] = useState(
    !isUnilateral ? (defaults as { reps: string }).reps : ""
  );
  const [load, setLoad] = useState(
    !isUnilateral ? (defaults as { load: string }).load : ""
  );
  const [rpe, setRpe] = useState(
    !isUnilateral ? (defaults as { rpe: string }).rpe : ""
  );

  // Unilateral state
  const uniDefaults = isUnilateral
    ? (defaults as { left: { reps: string; load: string; rpe: string }; right: { reps: string; load: string; rpe: string } })
    : { left: { reps: "", load: "", rpe: "" }, right: { reps: "", load: "", rpe: "" } };

  const [leftReps, setLeftReps] = useState(uniDefaults.left.reps);
  const [leftLoad, setLeftLoad] = useState(uniDefaults.left.load);
  const [leftRpe, setLeftRpe] = useState(uniDefaults.left.rpe);
  const [rightReps, setRightReps] = useState(uniDefaults.right.reps);
  const [rightLoad, setRightLoad] = useState(uniDefaults.right.load);
  const [rightRpe, setRightRpe] = useState(uniDefaults.right.rpe);

  const grouped = groupSets(existingSets);
  const [editingSetIndex, setEditingSetIndex] = useState<number | null>(null);
  const editingSets = editingSetIndex !== null
    ? existingSets.filter((s) => s.set_index === editingSetIndex)
    : [];

  // Paint the new set immediately (when the parent supports it), then run the
  // server action + refresh in the background. On failure the painted rows are
  // rolled back and an error shows. Falls back to await-then-refresh when no
  // optimistic callback is wired up (the standalone /log page).
  function submitSet(
    uni: { left: { reps: number; load: number; rpe: number | null }; right: { reps: number; load: number; rpe: number | null } } | null,
    bi: { reps: number; load: number; rpe: number | null } | null
  ) {
    setLogError(null);
    const nextIndex = (grouped.length > 0 ? grouped[grouped.length - 1][0] : 0) + 1;
    const rows: SetData[] = uni
      ? [
          { id: `pending-${crypto.randomUUID()}`, set_index: nextIndex, side: "left", ...uni.left },
          { id: `pending-${crypto.randomUUID()}`, set_index: nextIndex, side: "right", ...uni.right },
        ]
      : [{ id: `pending-${crypto.randomUUID()}`, set_index: nextIndex, side: "both", ...bi! }];
    onOptimisticLog?.(rows);
    // Logging is a user tap: unlock audio here so the rest alarm can play later.
    unlockAudio();
    onLogged?.(nextIndex);
    startTransition(async () => {
      try {
        if (uni) {
          await logUnilateralSet(workoutId, exerciseId, uni);
        } else {
          await logBilateralSet(workoutId, exerciseId, bi!);
        }
        if (optimistic) {
          // setTimeout escapes the transition context: isPending (which gates
          // the buttons) ends with the insert (~0.5s), while the heavy Today
          // re-render runs untracked in the background. The painted set stays
          // until the refreshed props arrive and reconcile it.
          setTimeout(() => router.refresh(), 0);
        } else {
          // Standalone /log page has no optimistic paint — the refresh IS the
          // visual update, so keep it inside the pending window.
          router.refresh();
        }
      } catch {
        const message = "Couldn't save that set — check your connection and try again.";
        if (optimistic) {
          // Parent surfaces it — this logger may already be unmounted
          // (auto-collapse on the final set).
          onOptimisticRollback?.(rows.map((r) => r.id), message);
        } else {
          // Standalone /log page: no parent to surface it.
          setLogError(message);
        }
      }
    });
  }

  function handleLog() {
    if (isUnilateral) {
      submitSet(
        {
          left: { reps: parseInt(leftReps) || 0, load: parseFloat(leftLoad) || 0, rpe: parseRpe(leftRpe) },
          right: { reps: parseInt(rightReps) || 0, load: parseFloat(rightLoad) || 0, rpe: parseRpe(rightRpe) },
        },
        null
      );
    } else {
      submitSet(null, {
        reps: parseInt(reps) || 0,
        load: parseFloat(load) || 0,
        rpe: parseRpe(rpe),
      });
    }
  }

  // The last set logged this session (highest set_index) — the basis for the
  // one-tap "repeat" action that removes the most common logging friction.
  const lastLogged: SetData[] | null =
    grouped.length > 0 ? grouped[grouped.length - 1][1] : null;

  function repeatSummary(): string | null {
    if (!lastLogged) return null;
    if (isUnilateral) {
      const l = lastLogged.find((s) => s.side === "left");
      const r = lastLogged.find((s) => s.side === "right");
      const parts: string[] = [];
      if (l) parts.push(`L ${l.reps}×${l.load}`);
      if (r) parts.push(`R ${r.reps}×${r.load}`);
      return parts.join(" / ") || null;
    }
    const s = lastLogged[0];
    return s ? `${s.reps} × ${s.load} lbs` : null;
  }

  // Log the previous set again verbatim (reps/load/rpe), no typing required.
  function handleRepeatLast() {
    if (!lastLogged) return;
    if (isUnilateral) {
      const l = lastLogged.find((s) => s.side === "left");
      const r = lastLogged.find((s) => s.side === "right");
      submitSet(
        {
          left: { reps: l?.reps ?? 0, load: l?.load ?? 0, rpe: l?.rpe ?? null },
          right: { reps: r?.reps ?? 0, load: r?.load ?? 0, rpe: r?.rpe ?? null },
        },
        null
      );
    } else {
      const s = lastLogged[0];
      submitSet(null, { reps: s?.reps ?? 0, load: s?.load ?? 0, rpe: s?.rpe ?? null });
    }
  }

  // Recent-sessions comparison: latest + prior side by side, one row per set
  // number, so progression is scannable without extra vertical space.
  const recentSessions = lastSession
    ? [lastSession, ...(lastSession.prior ? [lastSession.prior] : [])]
    : [];
  const recentCells = recentSessions.map((s) => sessionCellsByIndex(s.sets, isUnilateral));
  const recentRowIndexes = [...new Set(recentCells.flatMap((m) => [...m.keys()]))].sort(
    (a, b) => a - b
  );
  const shortDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="space-y-4">
      {/* Recent sessions reference — latest + prior side by side, aligned by
          set number, so progression reads at a glance */}
      {recentSessions.length > 0 && recentRowIndexes.length > 0 && (
        <Card className="p-3 bg-muted/30 border-muted">
          <div
            className="grid gap-x-3 gap-y-1 items-baseline"
            style={{ gridTemplateColumns: `1.5rem repeat(${recentSessions.length}, 1fr)` }}
          >
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              #
            </span>
            {recentSessions.map((s, i) => (
              <span key={i} className="text-xs text-muted-foreground font-semibold">
                {shortDate(s.performedOn)}
                {i === 0 && <span className="font-normal opacity-70"> · last</span>}
              </span>
            ))}
            {recentRowIndexes.map((idx) => (
              <div key={idx} className="contents">
                <span className="text-xs text-muted-foreground font-mono">{idx}</span>
                {recentCells.map((cells, i) => (
                  <div key={i} className="text-sm font-mono leading-tight">
                    {(cells.get(idx) ?? ["—"]).map((line, j) => (
                      <div key={j} className={i === 0 ? "text-foreground/85" : "text-foreground/55"}>
                        {line}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Existing sets */}
      {grouped.length > 0 && (
        <div className="space-y-2">
          {grouped.map(([index, sets]) => {
            // Rows still saving in the background can't be edited yet (no
            // server id) — they dim slightly until the refresh lands.
            const isSaving = sets.some((s) => s.id.startsWith("pending-"));
            return (
            <Card
              key={index}
              className={`p-3 cursor-pointer hover:bg-accent/50 transition-colors ${isSaving ? "opacity-60" : ""}`}
              onClick={() => { if (!isSaving) setEditingSetIndex(index); }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono w-8">
                  #{index}
                </span>
                {isUnilateral ? (
                  <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
                    {sets.map((s) => (
                      <div
                        key={s.id}
                        className={`${s.side === "left" ? "text-blue-400" : "text-orange-400"}`}
                      >
                        <span className="font-medium uppercase text-xs">
                          {s.side[0]}:
                        </span>{" "}
                        {s.reps}x{s.load}
                        {s.rpe && (
                          <span className="text-muted-foreground">
                            {" "}
                            @{s.rpe}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 text-sm">
                    {sets[0].reps} x {sets[0].load} lbs
                    {sets[0].rpe && (
                      <span className="text-muted-foreground">
                        {" "}
                        @ RPE {sets[0].rpe}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Card>
            );
          })}
        </div>
      )}

      <Separator />

      {/* Set timer / stopwatch — opens by default for timed exercises */}
      <SetTimer defaultSeconds={timedSeconds} autoOpen={timedSeconds != null} />

      {/* New set input */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">
          Set #{(grouped.length > 0 ? grouped[grouped.length - 1][0] : 0) + 1}
        </p>

        {isUnilateral ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-blue-400 text-xs font-semibold uppercase tracking-wider">
                Left
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Reps</Label>
                  <NumberField inputMode="numeric" placeholder="8" value={leftReps} onChange={setLeftReps} className="h-12 text-center text-lg" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Load (lbs)</Label>
                  <NumberField inputMode="decimal" placeholder="25" value={leftLoad} onChange={setLeftLoad} className="h-12 text-center text-lg" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">RPE <span className="text-muted-foreground/50">(1-10)</span></Label>
                  <NumberField inputMode="decimal" min="1" max="10" step="0.5" placeholder="—" value={leftRpe} onChange={setLeftRpe} className="h-12 text-center text-lg" />
                </div>
              </div>
              {bar && <PlateDisplay targetWeight={leftLoad} barWeight={bar.weight} />}
            </div>

            <div className="space-y-2">
              <Label className="text-orange-400 text-xs font-semibold uppercase tracking-wider">
                Right
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Reps</Label>
                  <NumberField inputMode="numeric" placeholder="8" value={rightReps} onChange={setRightReps} className="h-12 text-center text-lg" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Load (lbs)</Label>
                  <NumberField inputMode="decimal" placeholder="25" value={rightLoad} onChange={setRightLoad} className="h-12 text-center text-lg" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">RPE <span className="text-muted-foreground/50">(1-10)</span></Label>
                  <NumberField inputMode="decimal" min="1" max="10" step="0.5" placeholder="—" value={rightRpe} onChange={setRightRpe} className="h-12 text-center text-lg" />
                </div>
              </div>
              {bar && <PlateDisplay targetWeight={rightLoad} barWeight={bar.weight} />}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Reps</Label>
                <NumberField inputMode="numeric" placeholder="8" value={reps} onChange={setReps} className="h-12 text-center text-lg" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Load (lbs)</Label>
                <NumberField inputMode="decimal" placeholder="135" value={load} onChange={setLoad} className="h-12 text-center text-lg" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">RPE <span className="text-muted-foreground/50">(1-10)</span></Label>
                <NumberField inputMode="decimal" min="1" max="10" step="0.5" placeholder="—" value={rpe} onChange={setRpe} className="h-12 text-center text-lg" />
              </div>
            </div>
            {bar && <PlateDisplay targetWeight={load} barWeight={bar.weight} />}
          </div>
        )}

        {logError && (
          <p className="text-xs text-red-300 bg-red-400/10 border border-red-400/30 rounded-md p-2">
            {logError}
          </p>
        )}

        <Button
          onClick={handleLog}
          disabled={isPending}
          className="w-full h-12 text-base font-semibold"
        >
          {isPending && !optimistic ? "Logging..." : "Log Set"}
        </Button>

        {/* One-tap repeat of the previous set — the most common logging action */}
        {lastLogged && (
          <Button
            onClick={handleRepeatLast}
            disabled={isPending}
            variant="outline"
            className="w-full h-11 text-sm"
          >
            ↻ Repeat last{repeatSummary() ? ` · ${repeatSummary()}` : ""}
          </Button>
        )}

      </div>

      <EditSetSheet
        open={editingSetIndex !== null}
        onOpenChange={(open) => !open && setEditingSetIndex(null)}
        setIndex={editingSetIndex}
        sets={editingSets}
        workoutId={workoutId}
        exerciseId={exerciseId}
        isUnilateral={isUnilateral}
        bar={bar}
      />
    </div>
  );
}
