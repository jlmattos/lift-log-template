"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  createEquipment,
  updateEquipment,
  deleteEquipment,
  type EquipmentRow,
} from "@/actions/equipment";

/**
 * Collapsible manager for specialty bars on the /exercises page: add, rename,
 * change weight, delete. Assigning a bar to an exercise happens in the
 * exercise's own add/edit sheet.
 */
export function EquipmentManager({ equipment }: { equipment: EquipmentRow[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // One row at a time is in edit mode; "new" = the add form.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function beginEdit(row: EquipmentRow | null) {
    setError(null);
    setConfirmDeleteId(null);
    setEditingId(row ? row.id : "new");
    setName(row ? row.name : "");
    setWeight(row ? String(Number(row.bar_weight)) : "");
  }

  function handleSave() {
    const parsed = parseFloat(weight);
    setError(null);
    startTransition(async () => {
      const result =
        editingId === "new"
          ? await createEquipment(name, parsed)
          : editingId
            ? await updateEquipment(editingId, { name, barWeight: parsed })
            : {};
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteEquipment(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirmDeleteId(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 border border-border rounded-md">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-accent/30 transition-colors"
        aria-expanded={expanded}
      >
        <span className="text-sm font-medium">
          Bars &amp; Equipment
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            {equipment.length === 0
              ? "none yet"
              : equipment.map((e) => e.name).join(", ")}
          </span>
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/40 pt-2.5">
          <p className="text-xs text-muted-foreground">
            Specialty bars with their empty-bar weight. Assign one to an
            exercise (via its edit sheet) and plate math uses that bar.
          </p>

          {equipment.map((row) =>
            editingId === row.id ? (
              <div key={row.id} className="p-2 border border-border rounded-md space-y-2">
                <div className="grid grid-cols-[1fr_88px] gap-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="lbs"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingId(null)} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!name.trim() || !(parseFloat(weight) > 0) || isPending}
                    className="flex-1"
                  >
                    {isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              <div
                key={row.id}
                className="flex items-center justify-between gap-2 px-2 py-1.5 border border-border/60 rounded-md"
              >
                <span className="text-sm">
                  {row.name}
                  <span className="text-muted-foreground text-xs ml-1.5">
                    {Number(row.bar_weight)} lb bar
                  </span>
                </span>
                <div className="flex gap-1 shrink-0">
                  {confirmDeleteId === row.id ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(row.id)}
                        disabled={isPending}
                      >
                        {isPending ? "..." : "Delete"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => beginEdit(row)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setError(null);
                          setConfirmDeleteId(row.id);
                        }}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          )}

          {confirmDeleteId && (
            <p className="text-xs text-amber-300/90">
              Deleting a bar unlinks it from its exercises (they fall back to
              standard plate math). History is untouched.
            </p>
          )}

          {editingId === "new" ? (
            <div className="p-2 border border-border rounded-md space-y-2">
              <div className="grid grid-cols-[1fr_88px] gap-2">
                <Input
                  placeholder="e.g., EZ curl bar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="lbs"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingId(null)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!name.trim() || !(parseFloat(weight) > 0) || isPending}
                  className="flex-1"
                >
                  {isPending ? "Adding..." : "Add Bar"}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => beginEdit(null)} className="w-full">
              + Add Bar
            </Button>
          )}

          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}
