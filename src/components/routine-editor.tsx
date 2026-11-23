"use client";

import { useEffect, useRef, useState, useTransition, type ComponentPropsWithRef } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  setRoutineDay,
  setRoutineDayCardio,
  clearRoutineDay,
  activateRoutine,
  deactivateRoutine,
  deleteRoutine,
  updateRoutine,
  copyRoutineWeek,
  duplicateRoutine,
  setCycleDays,
  moveRoutineDay,
} from "@/actions/routines";
import { createTemplate } from "@/actions/templates";
import Link from "next/link";

// 7 generic day slots per week — user assigns templates to whichever they want
const DAY_SLOTS = [1, 2, 3, 4, 5, 6, 7];

type TemplateExercisePreview = {
  name: string;
  targetSets: number | null;
  targetReps: string | null;
};

type Template = {
  id: string;
  name: string;
  exerciseCount: number;
  exercises?: TemplateExercisePreview[];
};

type CardioTemplate = {
  id: string;
  name: string;
  type: string;
};

type RoutineDay = {
  id: string;
  weekNumber: number;
  dayNumber: number;
  templateId: string | null;
  template: { id: string; name: string } | null;
  cardioTemplateId: string | null;
  cardioTemplate: { id: string; name: string; type: string } | null;
  notes: string | null;
};

type Routine = {
  id: string;
  name: string;
  weeks: number;
  // Cycle mode: length of the day-cycle loop (null = weekly/calendar routine).
  cycle_days?: number | null;
  is_active: boolean;
  days: RoutineDay[];
};

export function RoutineEditor({
  routine,
  templates,
  cardioTemplates = [],
}: {
  routine: Routine;
  templates: Template[];
  cardioTemplates?: CardioTemplate[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pickerSlot, setPickerSlot] = useState<{ week: number; dayNumber: number } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(routine.name);
  const [newWeeks, setNewWeeks] = useState(routine.weeks.toString());
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Inline template create from the picker
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  // Ref attached to whichever template card matches the currently-assigned
  // template (cardio or strength). When the picker opens, we scroll to it
  // so the user lands on the active assignment instead of having to find
  // it in a long list.
  const currentAssignmentRef = useRef<HTMLDivElement | null>(null);

  // Scroll the currently-assigned card into view a tick after the sheet opens.
  // The 100ms delay gives Radix time to mount the sheet content first.
  useEffect(() => {
    if (pickerSlot === null) return;
    const t = setTimeout(() => {
      currentAssignmentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(t);
  }, [pickerSlot]);

  // Drag-and-drop day reordering. The optimistic move paints the drop
  // immediately; it's cleared when the refreshed routine prop arrives
  // (previous-value tracking during render, same pattern as elsewhere).
  const [optimisticMove, setOptimisticMove] = useState<{ from: string; to: string } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  // The browser fires a click on the source cell right after a drag ends —
  // swallow it so the picker doesn't pop open.
  const justDraggedRef = useRef(false);
  const [prevRoutine, setPrevRoutine] = useState(routine);
  if (prevRoutine !== routine) {
    setPrevRoutine(routine);
    setOptimisticMove(null);
  }
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );
  // The cell being dragged, as its "week-day" id. The floating copy renders
  // in a DragOverlay portal because the week Cards clip transformed children
  // (overflow-hidden).
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    justDraggedRef.current = true;
    setTimeout(() => { justDraggedRef.current = false; }, 150);
    const overId = e.over?.id;
    if (overId == null || overId === e.active.id) return;
    const [fromWeek, fromDay] = String(e.active.id).split("-").map(Number);
    const [toWeek, toDay] = String(overId).split("-").map(Number);
    setMoveError(null);
    setOptimisticMove({ from: `${fromWeek}-${fromDay}`, to: `${toWeek}-${toDay}` });
    startTransition(async () => {
      try {
        await moveRoutineDay(routine.id, { week: fromWeek, day: fromDay }, { week: toWeek, day: toDay });
      } catch (err) {
        setMoveError(err instanceof Error ? err.message : "Failed to move day");
      } finally {
        router.refresh();
      }
    });
  }

  // Build a lookup: "week-day" → template
  const lookup = new Map<string, RoutineDay>();
  for (const d of routine.days) {
    lookup.set(`${d.weekNumber}-${d.dayNumber}`, d);
  }
  if (optimisticMove) {
    const moved = lookup.get(optimisticMove.from);
    const displaced = lookup.get(optimisticMove.to);
    if (moved) {
      lookup.set(optimisticMove.to, moved);
      if (displaced) lookup.set(optimisticMove.from, displaced);
      else lookup.delete(optimisticMove.from);
    }
  }

  // Cycle mode: one ordered loop of N day-slots, untethered from weekdays.
  const isCycle = routine.cycle_days != null;
  const daySlots = isCycle
    ? Array.from({ length: routine.cycle_days as number }, (_, i) => i + 1)
    : DAY_SLOTS;
  const [cycleLenInput, setCycleLenInput] = useState(
    routine.cycle_days != null ? String(routine.cycle_days) : "9"
  );
  const [cycleError, setCycleError] = useState<string | null>(null);

  function handleSetCycleDays() {
    const n = parseInt(cycleLenInput);
    if (!n || n < 2 || n > 21) { setCycleError("Cycle length must be 2–21 days"); return; }
    setCycleError(null);
    startTransition(async () => {
      try {
        await setCycleDays(routine.id, n);
        router.refresh();
      } catch (e) {
        setCycleError(e instanceof Error ? e.message : "Failed to update cycle");
      }
    });
  }

  function handlePickTemplate(templateId: string | null) {
    if (!pickerSlot) return;
    startTransition(async () => {
      await setRoutineDay(routine.id, pickerSlot.week, pickerSlot.dayNumber, templateId);
      setPickerSlot(null);
      router.refresh();
    });
  }

  function handlePickCardio(cardioTemplateId: string | null) {
    if (!pickerSlot) return;
    startTransition(async () => {
      await setRoutineDayCardio(routine.id, pickerSlot.week, pickerSlot.dayNumber, cardioTemplateId);
      setPickerSlot(null);
      router.refresh();
    });
  }

  function handleClearDay() {
    if (!pickerSlot) return;
    startTransition(async () => {
      await clearRoutineDay(routine.id, pickerSlot.week, pickerSlot.dayNumber);
      setPickerSlot(null);
      router.refresh();
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      if (routine.is_active) {
        await deactivateRoutine();
      } else {
        await activateRoutine(routine.id);
      }
      router.refresh();
    });
  }

  function handleUpdate() {
    if (!newName.trim()) return;
    const weeksNum = parseInt(newWeeks) || 1;
    startTransition(async () => {
      await updateRoutine(routine.id, { name: newName, weeks: weeksNum });
      setRenameOpen(false);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteRoutine(routine.id);
      router.push("/routines");
      router.refresh();
    });
  }

  function handleCopyWeek(fromWeek: number, toWeek: number) {
    startTransition(async () => {
      await copyRoutineWeek(routine.id, fromWeek, toWeek);
      router.refresh();
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      const newRoutine = await duplicateRoutine(routine.id);
      router.push(`/routines/${newRoutine.id}`);
      router.refresh();
    });
  }

  function handleCreateInlineTemplate() {
    if (!newTemplateName.trim() || !pickerSlot) return;
    startTransition(async () => {
      const t = await createTemplate(newTemplateName);
      await setRoutineDay(routine.id, pickerSlot.week, pickerSlot.dayNumber, t.id);
      setCreateTemplateOpen(false);
      setNewTemplateName("");
      setPickerSlot(null);
      router.push(`/templates/${t.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Active toggle */}
      <Card className={`p-4 ${routine.is_active ? "border-blue-400 border-2 bg-blue-400/5" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">
              {routine.is_active ? "Active Routine" : "Activate this Routine"}
            </p>
            <p className="text-xs text-muted-foreground">
              {routine.is_active
                ? "Today page suggests workouts from this routine"
                : "Sets started date and shows today's workout on Today page"}
            </p>
          </div>
          <Button
            onClick={handleToggleActive}
            disabled={isPending}
            variant={routine.is_active ? "outline" : "default"}
            size="sm"
          >
            {routine.is_active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </Card>

      {/* Schedule grid — one row per week (weekly mode) or a single N-day
          cycle loop (cycle mode, untethered from weekdays) */}
      {/* Stable id keeps dnd-kit's generated aria ids identical between SSR and
    client render (avoids a hydration mismatch warning). */}
      <DndContext
        id="routine-days"
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragId(null)}
      >
      <div className="space-y-3">
        {Array.from({ length: isCycle ? 1 : routine.weeks }, (_, w) => {
          const weekNum = w + 1;
          return (
            <Card key={weekNum} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
                  {isCycle ? `${routine.cycle_days}-Day Cycle · advances as you complete sessions` : `Week ${weekNum}`}
                </h3>
                {!isCycle && weekNum > 1 && (
                  <button
                    onClick={() => handleCopyWeek(weekNum - 1, weekNum)}
                    disabled={isPending}
                    className="text-xs text-blue-300 hover:text-blue-200 transition-colors px-2 py-0.5 rounded hover:bg-blue-400/10"
                  >
                    ← Copy from Week {weekNum - 1}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {daySlots.map((dayNum) => (
                  <DayCell
                    key={dayNum}
                    week={weekNum}
                    dayNum={dayNum}
                    slot={lookup.get(`${weekNum}-${dayNum}`)}
                    dragDisabled={isPending}
                    onOpen={() => {
                      if (justDraggedRef.current) {
                        justDraggedRef.current = false;
                        return;
                      }
                      setPickerSlot({ week: weekNum, dayNumber: dayNum });
                    }}
                  />
                ))}
              </div>
            </Card>
          );
        })}
      </div>
      {/* Floating copy of the dragged cell — a portal, so week Cards'
          overflow-hidden can't clip it mid-drag. */}
      <DragOverlay dropAnimation={null}>
        {activeDragId && (
          <DayCellVisual
            dayNum={Number(activeDragId.split("-")[1])}
            slot={lookup.get(activeDragId)}
            className="shadow-xl ring-2 ring-blue-300/60 cursor-grabbing"
          />
        )}
      </DragOverlay>
      </DndContext>
      <p className="text-[11px] text-muted-foreground px-1">
        Drag a day onto another to move it — dropping on a filled day swaps them. On touch, hold a day briefly, then drag.
      </p>
      {moveError && <p className="text-xs text-red-300 px-1">{moveError}</p>}

      {/* Cycle settings: convert a 1-week routine to an N-day cycle, or resize
          an existing cycle. Cycle routines advance by completion, not weekday. */}
      {(isCycle || routine.weeks === 1) && (
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            {isCycle ? "Cycle length" : "Convert to day cycle"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {isCycle
              ? "Days in the loop. “Up next” advances as you complete sessions — resting just pauses the sequence."
              : "Untether this routine from weekdays: turn it into an N-day loop (e.g. 9) where “up next” follows your plan order, not the calendar."}
          </p>
          <div className="flex gap-2 mt-3">
            <Input
              inputMode="numeric"
              value={cycleLenInput}
              onChange={(e) => setCycleLenInput(e.target.value)}
              className="h-10 text-center w-24"
            />
            <Button
              onClick={handleSetCycleDays}
              disabled={isPending || (isCycle && parseInt(cycleLenInput) === routine.cycle_days)}
              variant="outline"
              className="flex-1"
            >
              {isPending ? "Saving…" : isCycle ? "Update length" : `Convert to ${parseInt(cycleLenInput) || "N"}-day cycle`}
            </Button>
          </div>
          {cycleError && <p className="text-xs text-red-300 mt-2">{cycleError}</p>}
        </Card>
      )}

      <div className="pt-4 space-y-2">
        <Button
          onClick={() => {
            setNewName(routine.name);
            setNewWeeks(routine.weeks.toString());
            setRenameOpen(true);
          }}
          variant="outline"
          className="w-full"
        >
          Edit Routine
        </Button>

        <Button
          onClick={handleDuplicate}
          disabled={isPending}
          variant="outline"
          className="w-full"
        >
          Duplicate Routine
        </Button>

        {!confirmDelete ? (
          <Button
            onClick={() => setConfirmDelete(true)}
            variant="ghost"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            Delete Routine
          </Button>
        ) : (
          <div className="space-y-2 p-3 border border-destructive/30 bg-destructive/5 rounded-md">
            <p className="text-sm text-destructive">Delete this routine?</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleDelete} disabled={isPending} variant="destructive" className="flex-1">
                {isPending ? "Deleting..." : "Yes, delete"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Template picker sheet */}
      <Sheet open={pickerSlot !== null} onOpenChange={(open) => !open && setPickerSlot(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {pickerSlot &&
                (isCycle
                  ? `Day ${pickerSlot.dayNumber} of ${routine.cycle_days}`
                  : `Week ${pickerSlot.week}, Day ${pickerSlot.dayNumber}`)}
            </SheetTitle>
          </SheetHeader>
          {(() => {
            const currentSlot = pickerSlot
              ? lookup.get(`${pickerSlot.week}-${pickerSlot.dayNumber}`)
              : undefined;
            const currentTemplateId = currentSlot?.templateId ?? null;
            const currentCardioTemplateId = currentSlot?.cardioTemplateId ?? null;
            const restIsCurrent = !currentTemplateId && !currentCardioTemplateId && !!pickerSlot;

            // Sort templates: current first, then others by name
            const sortedTemplates = [...templates].sort((a, b) => {
              if (a.id === currentTemplateId) return -1;
              if (b.id === currentTemplateId) return 1;
              return a.name.localeCompare(b.name);
            });

            const sortedCardio = [...cardioTemplates].sort((a, b) => {
              if (a.id === currentCardioTemplateId) return -1;
              if (b.id === currentCardioTemplateId) return 1;
              return a.name.localeCompare(b.name);
            });

            return (
          <div className="mt-4 space-y-2">
            {/* Current assignment summary */}
            {(currentTemplateId || currentCardioTemplateId) && (
              <div className="p-2 bg-muted/30 rounded text-xs space-y-0.5">
                <p className="uppercase tracking-wider text-muted-foreground font-semibold mb-1">Currently</p>
                {currentSlot?.template && (
                  <p>📋 <span className="text-blue-300">{currentSlot.template.name}</span></p>
                )}
                {currentSlot?.cardioTemplate && (
                  <p>🚣 <span className="text-orange-300">{currentSlot.cardioTemplate.name}</span></p>
                )}
              </div>
            )}

            {/* Full rest day */}
            <Card
              className={`p-3 cursor-pointer hover:bg-accent/50 transition-colors ${
                restIsCurrent
                  ? "border-blue-400 border-2 bg-blue-400/10 shadow-[0_0_0_3px_rgba(96,165,250,0.15)]"
                  : "border-dashed"
              }`}
              onClick={handleClearDay}
            >
              <div className="flex items-center justify-between">
                <span className={`${restIsCurrent ? "font-medium" : "text-sm text-muted-foreground"}`}>
                  {restIsCurrent ? "Rest day" : "Make full rest day (clears both)"}
                </span>
                {restIsCurrent && <span className="text-xs text-blue-300">Current</span>}
              </div>
            </Card>

            {/* CARDIO TEMPLATES SECTION */}
            <p className="text-xs uppercase tracking-wider text-orange-300 font-semibold pt-3">
              🚣 Cardio templates
            </p>
            {sortedCardio.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No cardio templates yet.</p>
            ) : (
              <>
                {/* "Remove cardio" option when one is assigned */}
                {currentCardioTemplateId && (
                  <Card
                    className="p-2 cursor-pointer hover:bg-accent/50 transition-colors border-dashed"
                    onClick={() => handlePickCardio(null)}
                  >
                    <span className="text-xs text-muted-foreground">Remove cardio (keep strength if any)</span>
                  </Card>
                )}
                {sortedCardio.map((ct) => {
                  const isCurrent = ct.id === currentCardioTemplateId;
                  return (
                    <Card
                      key={ct.id}
                      ref={isCurrent ? currentAssignmentRef : null}
                      className={`p-3 cursor-pointer hover:bg-accent/50 transition-colors ${
                        isCurrent
                          ? "border-orange-400 border-2 bg-orange-400/10 shadow-[0_0_0_3px_rgba(251,146,60,0.15)]"
                          : ""
                      }`}
                      onClick={() => handlePickCardio(ct.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{ct.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{ct.type}</span>
                          {isCurrent && <span className="text-xs text-orange-300">Current</span>}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </>
            )}

            {/* STRENGTH TEMPLATES SECTION */}
            <p className="text-xs uppercase tracking-wider text-blue-300 font-semibold pt-3">
              📋 Strength templates
            </p>
            {/* "Remove strength" option when one is assigned */}
            {currentTemplateId && (
              <Card
                className="p-2 cursor-pointer hover:bg-accent/50 transition-colors border-dashed"
                onClick={() => handlePickTemplate(null)}
              >
                <span className="text-xs text-muted-foreground">Remove strength (keep cardio if any)</span>
              </Card>
            )}

            {/* Render templates in sorted order */}
            {sortedTemplates.map((t) => {
              const isCurrent = t.id === currentTemplateId;
              return (
                <Card
                  key={t.id}
                  ref={isCurrent ? currentAssignmentRef : null}
                  className={`p-3 cursor-pointer hover:bg-accent/50 transition-colors ${
                    isCurrent
                      ? "border-blue-400 border-2 bg-blue-400/10 shadow-[0_0_0_3px_rgba(96,165,250,0.15)]"
                      : ""
                  }`}
                  onClick={() => handlePickTemplate(t.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{t.name}</span>
                        {isCurrent && <span className="text-xs text-blue-300">Current</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.exerciseCount} exercise{t.exerciseCount !== 1 ? "s" : ""}
                      </p>
                      {/* Exercise preview */}
                      {t.exercises && t.exercises.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/40 space-y-0.5">
                          {t.exercises.slice(0, 6).map((ex, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-foreground/70 truncate">
                                {i + 1}. {ex.name}
                              </span>
                              {(ex.targetSets || ex.targetReps) && (
                                <span className="text-blue-300/80 font-mono shrink-0 ml-2">
                                  {ex.targetSets ?? "?"}×{ex.targetReps ?? "?"}
                                </span>
                              )}
                            </div>
                          ))}
                          {t.exercises.length > 6 && (
                            <p className="text-xs text-muted-foreground/60 italic">
                              + {t.exercises.length - 6} more
                            </p>
                          )}
                        </div>
                      )}
                      <Link
                        href={`/templates/${t.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-block mt-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Edit template →
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            })}

            {/* Inline create new template */}
            {!createTemplateOpen ? (
              <Card
                className="p-3 cursor-pointer hover:bg-accent/50 transition-colors border-dashed"
                onClick={() => setCreateTemplateOpen(true)}
              >
                <span className="text-sm text-muted-foreground">
                  + Create new template
                </span>
              </Card>
            ) : (
              <div className="p-3 border-2 border-blue-400/40 bg-blue-400/5 rounded-md space-y-2">
                <Label className="text-xs">New template name</Label>
                <Input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g., Push Day"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  After creating, you&rsquo;ll be taken to the template to add exercises.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCreateTemplateOpen(false);
                      setNewTemplateName("");
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateInlineTemplate}
                    disabled={!newTemplateName.trim() || isPending}
                    size="sm"
                    className="flex-1"
                  >
                    {isPending ? "Creating..." : "Create & Assign"}
                  </Button>
                </div>
              </div>
            )}

            {templates.length === 0 && !createTemplateOpen && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No templates yet. Tap &ldquo;+ Create new template&rdquo; above.
              </p>
            )}
          </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Edit routine sheet */}
      <Sheet open={renameOpen} onOpenChange={setRenameOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Edit Routine</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="rname">Name</Label>
              <Input
                id="rname"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="rweeks">Cycle Length (weeks)</Label>
              <Input
                id="rweeks"
                inputMode="numeric"
                value={newWeeks}
                onChange={(e) => setNewWeeks(e.target.value)}
                className="h-12 text-center text-lg"
              />
              {parseInt(newWeeks) < routine.weeks && (
                <p className="text-xs text-amber-400/80 mt-1">
                  Reducing weeks will delete schedule for weeks {parseInt(newWeeks) + 1}–{routine.weeks}
                </p>
              )}
            </div>
            <Button
              onClick={handleUpdate}
              disabled={!newName.trim() || isPending}
              className="w-full h-12"
            >
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * One schedule-grid cell: tap to open the picker, drag onto another cell to
 * move the day (drop on a filled cell to swap). Only cells with content are
 * draggable; every cell is a drop target. While dragging, the source cell
 * dims and a DragOverlay copy follows the pointer (see DayCellVisual).
 */
function DayCell({
  week,
  dayNum,
  slot,
  dragDisabled,
  onOpen,
}: {
  week: number;
  dayNum: number;
  slot: RoutineDay | undefined;
  dragDisabled: boolean;
  onOpen: () => void;
}) {
  const id = `${week}-${dayNum}`;
  const hasContent = !!slot && (!!slot.template || !!slot.cardioTemplate || !!slot.notes);
  const drag = useDraggable({ id, disabled: dragDisabled || !hasContent });
  const drop = useDroppable({ id });

  return (
    <DayCellVisual
      dayNum={dayNum}
      slot={slot}
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      onClick={onOpen}
      {...drag.listeners}
      {...drag.attributes}
      // "manipulation" keeps page scrolling alive; the 250ms hold is what
      // hands the touch to the drag sensor.
      style={{ touchAction: "manipulation" }}
      className={
        drag.isDragging
          ? "opacity-40"
          : `transition-all ${drop.isOver ? "ring-2 ring-blue-300 scale-105" : ""}`
      }
    />
  );
}

/**
 * The visual body of a day cell, shared by the in-grid button and the
 * DragOverlay copy that follows the pointer.
 */
function DayCellVisual({
  dayNum,
  slot,
  className = "",
  ...buttonProps
}: {
  dayNum: number;
  slot: RoutineDay | undefined;
  className?: string;
} & Omit<ComponentPropsWithRef<"button">, "slot">) {
  const hasStrength = !!slot?.template;
  const hasCardio = !!slot?.cardioTemplate;
  const isRest = !hasStrength && !hasCardio;

  return (
    <button
      {...buttonProps}
      className={`flex flex-col items-center justify-center p-2 rounded-md border-2 min-h-[60px] text-center overflow-hidden ${
        hasStrength
          ? "border-blue-400/50 bg-blue-400/10"
          : hasCardio
            ? "border-orange-400/50 bg-orange-400/10"
            : "border-dashed border-border bg-background/50 hover:border-muted-foreground/40"
      } ${className}`}
    >
      <span className="text-[10px] uppercase font-medium text-muted-foreground">
        D{dayNum}
      </span>
      {hasStrength && (
        <span className="text-[10px] mt-0.5 leading-tight text-blue-300 font-medium truncate w-full">
          {slot!.template!.name}
        </span>
      )}
      {hasCardio && (
        <span className="text-[10px] mt-0.5 leading-tight text-orange-300 font-medium truncate w-full">
          🚣 {slot!.cardioTemplate!.name}
        </span>
      )}
      {isRest && (
        <span className="text-[10px] mt-0.5 text-muted-foreground/50">Rest</span>
      )}
    </button>
  );
}
