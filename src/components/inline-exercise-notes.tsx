"use client";

import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listExerciseNotes,
  addExerciseNote,
  deleteExerciseNote,
  type ExerciseNote,
} from "@/actions/exercise-notes";

/**
 * Self-contained sticky-notes for an exercise, for use inside the inline Today
 * accordion (where there's no server-loaded `initialNotes` prop). Lazily loads
 * its own notes on first render and manages its own list state — so add/delete
 * update in place without a full page refresh.
 */
export function InlineExerciseNotes({ exerciseId }: { exerciseId: string }) {
  const [notes, setNotes] = useState<ExerciseNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load once on mount (the component only mounts when the card is expanded).
  // Must be an effect, not render-phase: listExerciseNotes is a server action,
  // and invoking one during render trips React's update-during-render warning
  // via the router.
  useEffect(() => {
    let alive = true;
    listExerciseNotes(exerciseId)
      .then((n) => { if (alive) setNotes(n); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [exerciseId]);

  function handleAdd() {
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      await addExerciseNote(exerciseId, body);
      setDraft("");
      setNotes(await listExerciseNotes(exerciseId));
    });
  }

  function handleDelete(noteId: string) {
    startTransition(async () => {
      await deleteExerciseNote(noteId, exerciseId);
      setConfirmDeleteId(null);
      setNotes(await listExerciseNotes(exerciseId));
    });
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        📌 Notes{loaded ? ` (${notes.length})` : ""}
      </p>

      {loaded && notes.length === 0 && (
        <p className="text-xs text-muted-foreground/70">
          No notes yet. Add form cues, mods, warnings, etc.
        </p>
      )}

      <div className="space-y-2">
        {notes.map((n) => (
          <div key={n.id} className="p-2.5 bg-amber-400/5 border border-amber-400/20 rounded-md">
            <p className="text-sm whitespace-pre-wrap">{n.body}</p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-muted-foreground/60">
                {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
              {confirmDeleteId === n.id ? (
                <div className="flex gap-1">
                  <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5">
                    Cancel
                  </button>
                  <button onClick={() => handleDelete(n.id)} disabled={isPending} className="text-xs text-destructive hover:text-destructive/80 px-2 py-0.5">
                    Delete
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(n.id)}
                  className="text-sm text-muted-foreground hover:text-destructive transition-colors min-w-[40px] min-h-[36px] -mr-2 -mb-1 inline-flex items-center justify-center"
                  aria-label="Delete note"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <Input
          placeholder="e.g., 'Keep elbows tucked'"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) handleAdd();
          }}
        />
        <Button onClick={handleAdd} disabled={!draft.trim() || isPending} size="sm">
          Add
        </Button>
      </div>
    </div>
  );
}
