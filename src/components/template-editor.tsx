"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  addExerciseToTemplate,
  removeExerciseFromTemplate,
  updateTemplate,
  deleteTemplate,
  moveTemplateExercise,
  moveTemplateExerciseToPosition,
  updateTemplateExerciseTargets,
  updateTemplateExerciseTiming,
  linkTemplateExerciseWithNext,
  unlinkTemplateExerciseFromNext,
} from "@/actions/templates";
import { deriveGroups, formatSeconds } from "@/lib/groups";
import { REST_PRESETS } from "@/lib/timer-settings";
import { PrescriptionMarkdown } from "@/components/prescription-markdown";

type Exercise = {
  id: string;
  name: string;
  is_unilateral: boolean;
  equipment_type?: string;
  equipment?: { name: string; bar_weight: number | string } | null;
};

type Template = {
  id: string;
  name: string;
  category?: string | null;
  /** "How this template works" — markdown shown at the top of the page. */
  prescription_notes?: string | null;
  exercises: {
    templateExerciseId: string;
    position: number;
    targetSets: number | null;
    targetReps: string | null;
    /** Superset/tri-set membership (adjacent equal blocks group). */
    block?: number | null;
    /** Rest after a set, seconds. */
    restSeconds?: number | null;
    /** Timed-set duration, seconds. */
    timedSeconds?: number | null;
    exercise: Exercise;
  }[];
};

type TemplateExercise = Template["exercises"][number];

function TemplateExerciseRow({
  tex,
  idx,
  isFirst,
  isLast,
  onMove,
  onMoveTo,
  total,
  onRemove,
  disabled,
  inGroup,
  isInnerMember,
  onError,
}: {
  tex: TemplateExercise;
  idx: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: "up" | "down") => void;
  /** Jump to a typed 1-based slot. */
  onMoveTo: (index: number) => void;
  total: number;
  onRemove: () => void;
  disabled: boolean;
  /** Rendered inside a superset block (flatter card, no own frame). */
  inGroup: boolean;
  /** Inner block members go straight to their partner — no rest field. */
  isInnerMember: boolean;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [sets, setSets] = useState(tex.targetSets?.toString() ?? "");
  const [reps, setReps] = useState(tex.targetReps ?? "");
  const [rest, setRest] = useState(tex.restSeconds?.toString() ?? "");
  const [timed, setTimed] = useState(tex.timedSeconds?.toString() ?? "");
  const [isSaving, startSave] = useTransition();

  // Typed position: shows the current slot; commit on blur / Enter. Resync
  // when the server order changes (render-phase adjustment, no effect).
  const [slot, setSlot] = useState(String(idx + 1));
  const [prevIdx, setPrevIdx] = useState(idx);
  if (prevIdx !== idx) {
    setPrevIdx(idx);
    setSlot(String(idx + 1));
  }
  function commitSlot() {
    const n = parseInt(slot);
    if (isNaN(n) || n < 1 || n > total) {
      setSlot(String(idx + 1));
      return;
    }
    if (n !== idx + 1) onMoveTo(n);
  }

  function saveTiming(nextRest = rest, nextTimed = timed) {
    const restNum = nextRest.trim() === "" ? null : parseInt(nextRest);
    const timedNum = nextTimed.trim() === "" ? null : parseInt(nextTimed);
    const clean = (n: number | null) => (n == null || isNaN(n) || n <= 0 ? null : n);
    if (clean(restNum) === (tex.restSeconds ?? null) && clean(timedNum) === (tex.timedSeconds ?? null)) return;
    startSave(async () => {
      try {
        onError(null);
        await updateTemplateExerciseTiming(tex.templateExerciseId, clean(restNum), clean(timedNum));
        router.refresh();
      } catch (e) {
        onError(e instanceof Error ? e.message : "Couldn't save timing");
      }
    });
  }

  function saveTargets() {
    const setsNum = sets.trim() === "" ? null : parseInt(sets);
    const repsStr = reps.trim() || null;
    // Only save if changed
    if (
      (setsNum ?? null) === (tex.targetSets ?? null) &&
      repsStr === tex.targetReps
    )
      return;
    startSave(async () => {
      await updateTemplateExerciseTargets(
        tex.templateExerciseId,
        setsNum && !isNaN(setsNum) ? setsNum : null,
        repsStr
      );
      router.refresh();
    });
  }

  return (
    <Card className={inGroup ? "p-3 rounded-none border-0 shadow-none bg-transparent" : "p-3"}>
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onMove("up")}
            disabled={isFirst || disabled}
            className="text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed transition-colors p-0.5"
            aria-label="Move up"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m18 15-6-6-6 6" />
            </svg>
          </button>
          <button
            onClick={() => onMove("down")}
            disabled={isLast || disabled}
            className="text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed transition-colors p-0.5"
            aria-label="Move down"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
        <input
          inputMode="numeric"
          value={slot}
          onChange={(e) => setSlot(e.target.value.replace(/[^0-9]/g, ""))}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commitSlot}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
          disabled={disabled}
          aria-label={`Position of ${tex.exercise.name} (1–${total})`}
          title="Type a number to move this exercise"
          className="w-8 h-7 text-xs font-mono text-center rounded border border-border/60 bg-background/60 focus:border-blue-400/60 focus:outline-none disabled:opacity-50"
        />
        <div className="flex-1 min-w-0">
          <span className="font-medium">{tex.exercise.name}</span>
          <div className="flex gap-1 mt-0.5">
            {tex.exercise.equipment ? (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {tex.exercise.equipment.name}
              </span>
            ) : (
              tex.exercise.equipment_type === "barbell" && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">BB</span>
              )
            )}
            {tex.exercise.is_unilateral && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">L/R</span>
            )}
          </div>
        </div>
        <button
          onClick={onRemove}
          disabled={disabled}
          className="text-muted-foreground hover:text-destructive transition-colors p-1"
          aria-label="Remove from template"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      {/* Target inputs */}
      <div className="mt-2 pt-2 border-t border-border/40 grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Target sets
          </Label>
          <Input
            inputMode="numeric"
            placeholder="—"
            value={sets}
            onChange={(e) => setSets(e.target.value)}
            onBlur={saveTargets}
            disabled={isSaving}
            className="h-9 text-sm text-center"
          />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Target reps
          </Label>
          <Input
            placeholder="e.g. 8 or 8-10"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            onBlur={saveTargets}
            disabled={isSaving}
            className="h-9 text-sm text-center"
          />
        </div>
      </div>

      {/* Timers: rest after a set (round rest when last in a block) + timed-set duration */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {isInnerMember ? (
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Rest</Label>
            <p className="text-xs text-muted-foreground/80 mt-2 leading-snug">
              → none — go straight to the next lift. Round rest is set on the block&apos;s last lift.
            </p>
          </div>
        ) : (
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Rest <span className="normal-case tracking-normal text-muted-foreground/60">(sec{inGroup ? ", between rounds" : ""})</span>
          </Label>
          <Input
            inputMode="numeric"
            placeholder={inGroup ? "round rest" : "e.g. 90"}
            value={rest}
            onChange={(e) => setRest(e.target.value)}
            onBlur={() => saveTiming()}
            disabled={isSaving}
            className="h-9 text-sm text-center"
          />
          <div className="flex gap-1 mt-1 flex-wrap">
            {REST_PRESETS.filter((r) => r <= 180).map((r) => (
              <button
                key={r}
                type="button"
                disabled={isSaving}
                onClick={() => {
                  const v = rest === String(r) ? "" : String(r);
                  setRest(v);
                  saveTiming(v, timed);
                }}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  rest === String(r)
                    ? "bg-blue-400/20 text-blue-200 border border-blue-400/40"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {formatSeconds(r)}
              </button>
            ))}
          </div>
        </div>
        )}
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Timed set <span className="normal-case tracking-normal text-muted-foreground/60">(sec)</span>
          </Label>
          <Input
            inputMode="numeric"
            placeholder="holds, rower…"
            value={timed}
            onChange={(e) => setTimed(e.target.value)}
            onBlur={() => saveTiming()}
            disabled={isSaving}
            className="h-9 text-sm text-center"
          />
          {timed.trim() !== "" && !isNaN(parseInt(timed)) && (
            <p className="text-[10px] text-muted-foreground mt-1 font-mono">
              ⏱ {formatSeconds(parseInt(timed))} countdown opens on Today
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * The seam between two adjacent template rows: tap to link them into a
 * superset (or extend / merge blocks), or to split a block at this point.
 */
function LinkSeam({
  linked,
  disabled,
  onToggle,
}: {
  linked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`flex justify-center ${linked ? "py-0.5 bg-muted/30" : "-my-1 relative z-10"}`}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors disabled:opacity-40 ${
          linked
            ? "border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/40 bg-background"
            : "border-dashed border-blue-400/40 text-blue-300/80 hover:text-blue-200 hover:bg-blue-400/10 bg-background"
        }`}
        aria-label={linked ? "Unlink these exercises" : "Link as superset"}
      >
        {linked ? "⛓ unlink" : "⛓ link as superset"}
      </button>
    </div>
  );
}

export function TemplateEditor({
  template,
  allExercises,
}: {
  template: Template;
  allExercises: Exercise[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(template.name);
  const [newCategory, setNewCategory] = useState(template.category ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(template.prescription_notes ?? "");
  const [confirmNotesDelete, setConfirmNotesDelete] = useState(false);

  function openNotes() {
    setNotesDraft(template.prescription_notes ?? "");
    setConfirmNotesDelete(false);
    setNotesOpen(true);
  }
  function saveNotes(value: string | null) {
    startTransition(async () => {
      try {
        setActionError(null);
        await updateTemplate(template.id, { prescription_notes: value });
        setNotesOpen(false);
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Couldn't save notes");
      }
    });
  }

  function handleMoveTo(templateExerciseId: string, index: number) {
    startTransition(async () => {
      try {
        setActionError(null);
        await moveTemplateExerciseToPosition(templateExerciseId, index);
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Couldn't move the exercise");
      }
    });
  }

  const groups = deriveGroups(
    template.exercises.map((tex) => ({
      tex,
      position: tex.position,
      block: tex.block ?? null,
      restSeconds: tex.restSeconds ?? null,
    }))
  );
  // Position-sorted flat list (for prev/next relationships and numbering).
  const ordered = groups.flatMap((g) => g.members.map((m) => m.tex));
  const indexOf = new Map(ordered.map((t, i) => [t.templateExerciseId, i]));

  function handleLinkToggle(tex: TemplateExercise, linked: boolean) {
    startTransition(async () => {
      try {
        setActionError(null);
        if (linked) await unlinkTemplateExerciseFromNext(tex.templateExerciseId);
        else await linkTemplateExerciseWithNext(tex.templateExerciseId);
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Couldn't update the group");
      }
    });
  }

  const includedIds = new Set(template.exercises.map((e) => e.exercise.id));
  const available = allExercises.filter(
    (e) =>
      !includedIds.has(e.id) &&
      (search === "" || e.name.toLowerCase().includes(search.toLowerCase()))
  );

  function handleAdd(exerciseId: string) {
    startTransition(async () => {
      await addExerciseToTemplate(template.id, exerciseId);
      router.refresh();
    });
  }

  function handleRemove(templateExerciseId: string) {
    startTransition(async () => {
      await removeExerciseFromTemplate(templateExerciseId);
      router.refresh();
    });
  }

  function handleMove(templateExerciseId: string, direction: "up" | "down") {
    startTransition(async () => {
      await moveTemplateExercise(templateExerciseId, direction);
      router.refresh();
    });
  }

  function handleRename() {
    if (!newName.trim()) return;
    startTransition(async () => {
      await updateTemplate(template.id, {
        name: newName,
        category: newCategory || null,
      });
      setRenameOpen(false);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteTemplate(template.id);
      router.push("/templates");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {/* "How this template works" — editable / deletable */}
      {template.prescription_notes ? (
        <Card className="p-4 mb-1 bg-blue-400/5 border-blue-400/30">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider text-blue-300 font-semibold">
              How this template works
            </p>
            <button
              type="button"
              onClick={openNotes}
              className="text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded px-2 py-0.5"
            >
              Edit
            </button>
          </div>
          <PrescriptionMarkdown content={template.prescription_notes} />
        </Card>
      ) : (
        <button
          type="button"
          onClick={openNotes}
          className="w-full h-9 mb-1 rounded-md text-xs border border-dashed border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          + Add notes (how this template works)
        </button>
      )}

      {/* Exercise list */}
      {template.exercises.length === 0 && (
        <p className="text-muted-foreground text-center py-6">
          No exercises in this template yet.
        </p>
      )}

      {actionError && (
        <Card className="p-3 border-amber-400/40 bg-amber-400/10">
          <p className="text-sm text-amber-200">⚠ {actionError}</p>
        </Card>
      )}

      {groups.map((g, gi) => {
        const renderRow = (tex: TemplateExercise, inGroup: boolean, isInnerMember = false) => {
          const idx = indexOf.get(tex.templateExerciseId) ?? 0;
          return (
            <TemplateExerciseRow
              key={tex.templateExerciseId}
              tex={tex}
              idx={idx}
              isFirst={idx === 0}
              isLast={idx === ordered.length - 1}
              onMove={(dir) => handleMove(tex.templateExerciseId, dir)}
              onMoveTo={(n) => handleMoveTo(tex.templateExerciseId, n)}
              total={ordered.length}
              onRemove={() => handleRemove(tex.templateExerciseId)}
              disabled={isPending}
              inGroup={inGroup}
              isInnerMember={isInnerMember}
              onError={setActionError}
            />
          );
        };
        const lastMember = g.members[g.members.length - 1].tex;
        const isLastGroup = gi === groups.length - 1;
        const grouped = g.members.length >= 2 && !!g.label;

        return (
          <div key={g.key} className="space-y-2">
            {grouped ? (
              <div className="rounded-xl border-2 border-blue-400/30 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-400/10 border-b border-border/40">
                  <span className="font-mono text-xs font-bold w-5 h-5 rounded bg-foreground/10 flex items-center justify-center">
                    {g.label}
                  </span>
                  <span className="text-xs uppercase tracking-wider text-blue-200/80 font-semibold">
                    {g.kind}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    · {g.restSeconds != null ? `rest ${formatSeconds(g.restSeconds)} between rounds` : "no round rest set"}
                  </span>
                </div>
                <div className="divide-y divide-border/40">
                  {g.members.map((m, mi) => (
                    <div key={m.tex.templateExerciseId}>
                      {renderRow(m.tex, true, mi < g.members.length - 1)}
                      {mi < g.members.length - 1 && (
                        <LinkSeam
                          linked
                          disabled={isPending}
                          onToggle={() => handleLinkToggle(m.tex, true)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              renderRow(g.members[0].tex, false)
            )}
            {!isLastGroup && (
              <LinkSeam
                linked={false}
                disabled={isPending}
                onToggle={() => handleLinkToggle(lastMember, false)}
              />
            )}
          </div>
        );
      })}

      <Button
        onClick={() => setPickerOpen(true)}
        variant="outline"
        className="w-full h-12 border-dashed text-muted-foreground"
      >
        + Add Exercise to Template
      </Button>

      <div className="pt-6 space-y-2">
        <Button
          onClick={() => {
            setNewName(template.name);
            setNewCategory(template.category ?? "");
            setRenameOpen(true);
          }}
          variant="outline"
          className="w-full"
        >
          Edit Name / Category
        </Button>

        {!confirmDelete ? (
          <Button
            onClick={() => setConfirmDelete(true)}
            variant="ghost"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            Delete Template
          </Button>
        ) : (
          <div className="space-y-2 p-3 border border-destructive/30 bg-destructive/5 rounded-md">
            <p className="text-sm text-destructive">Delete this template?</p>
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

      {/* Exercise picker */}
      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Add Exercise</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <Input
              placeholder="Search exercises..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {available.map((e) => (
                <Card
                  key={e.id}
                  className="p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => {
                    handleAdd(e.id);
                    setSearch("");
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{e.name}</span>
                    <div className="flex gap-1">
                      {e.equipment ? (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {e.equipment.name}
                        </span>
                      ) : (
                        e.equipment_type === "barbell" && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">BB</span>
                        )
                      )}
                      {e.is_unilateral && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">L/R</span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
              {available.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {search ? "No exercises match" : "All your exercises are already in this template"}
                </p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Notes sheet — markdown, save / delete */}
      <Sheet open={notesOpen} onOpenChange={setNotesOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Template notes</SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Markdown works: <span className="font-mono">## Heading</span>,{" "}
              <span className="font-mono">**bold**</span>, <span className="font-mono">- bullets</span>.
            </p>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onFocus={(e) =>
                setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 300)
              }
              className="w-full min-h-[260px] p-3 bg-background border border-border rounded-md text-sm font-mono leading-relaxed"
              placeholder="Purpose, superset structure, cues, progression rules, watch flags…"
              autoFocus
            />
            <Button
              onClick={() => saveNotes(notesDraft)}
              disabled={isPending}
              className="w-full h-12"
            >
              {isPending ? "Saving..." : "Save notes"}
            </Button>
            {template.prescription_notes &&
              (!confirmNotesDelete ? (
                <Button
                  variant="ghost"
                  onClick={() => setConfirmNotesDelete(true)}
                  disabled={isPending}
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  Delete notes
                </Button>
              ) : (
                <div className="space-y-2 p-3 border border-destructive/30 bg-destructive/5 rounded-md">
                  <p className="text-sm text-destructive">Remove these notes from the template?</p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setConfirmNotesDelete(false)} className="flex-1">
                      Cancel
                    </Button>
                    <Button
                      onClick={() => saveNotes(null)}
                      disabled={isPending}
                      variant="destructive"
                      className="flex-1"
                    >
                      {isPending ? "Deleting..." : "Yes, delete"}
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Rename sheet */}
      <Sheet open={renameOpen} onOpenChange={setRenameOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Template</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="templateName">Name</Label>
              <Input
                id="templateName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onFocus={(e) =>
                  setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 300)
                }
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="templateCat">
                Category <span className="text-muted-foreground/60">(optional)</span>
              </Label>
              <Input
                id="templateCat"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onFocus={(e) =>
                  setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 300)
                }
                placeholder="e.g., Strength, Conditioning"
              />
            </div>
            <Button
              onClick={handleRename}
              disabled={!newName.trim() || isPending}
              className="w-full h-12"
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
