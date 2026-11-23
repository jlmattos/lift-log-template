"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addExerciseNote,
  deleteExerciseNote,
  type ExerciseNote,
} from "@/actions/exercise-notes";

export function ExerciseNotesSection({
  exerciseId,
  initialNotes,
}: {
  exerciseId: string;
  initialNotes: ExerciseNote[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleAdd() {
    if (!draft.trim()) return;
    startTransition(async () => {
      await addExerciseNote(exerciseId, draft);
      setDraft("");
      router.refresh();
    });
  }

  function handleDelete(noteId: string) {
    startTransition(async () => {
      await deleteExerciseNote(noteId, exerciseId);
      setConfirmDeleteId(null);
      router.refresh();
    });
  }

  return (
    <Card className="p-4 mb-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        📌 Notes ({initialNotes.length})
      </p>

      {/* Existing notes */}
      <div className="space-y-2">
        {initialNotes.length === 0 && (
          <p className="text-xs text-muted-foreground/70">
            No notes yet. Add form cues, mods, warnings, etc.
          </p>
        )}
        {initialNotes.map((n) => (
          <div
            key={n.id}
            className="p-2.5 bg-amber-400/5 border border-amber-400/20 rounded-md"
          >
            <p className="text-sm whitespace-pre-wrap">{n.body}</p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-muted-foreground/60">
                {new Date(n.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {confirmDeleteId === n.id ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(n.id)}
                    disabled={isPending}
                    className="text-xs text-destructive hover:text-destructive/80 px-2 py-0.5"
                  >
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

      {/* Add new note */}
      <div className="mt-3 flex gap-2">
        <Input
          placeholder="e.g., 'Keep elbows tucked'"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) handleAdd();
          }}
        />
        <Button
          onClick={handleAdd}
          disabled={!draft.trim() || isPending}
          size="sm"
        >
          Add
        </Button>
      </div>
    </Card>
  );
}
