"use client";

import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  listEquipment,
  createEquipment,
  type EquipmentRow,
} from "@/actions/equipment";

/**
 * Picks the specialty bar an exercise is loaded on: "Standard" (equipment-type
 * default — 45 lb bar when the type is barbell) or a named bar from the
 * equipment table (trap bar, EZ bar, ...). New bars can be added inline, so
 * equipment is created right where it's first needed.
 */
export function EquipmentPicker({
  value,
  onChange,
  /** Reload the bar list when this flips true (the parent sheet opening). */
  active,
  /** The exercise's equipment type — decides what "no bar" means. */
  equipmentType,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  active: boolean;
  equipmentType: string;
}) {
  const [bars, setBars] = useState<EquipmentRow[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (active) listEquipment().then(setBars).catch(() => {});
  }, [active]);

  function handleAdd() {
    const weight = parseFloat(newWeight);
    setAddError(null);
    startTransition(async () => {
      const { data: created, error } = await createEquipment(newName, weight);
      if (error || !created) {
        setAddError(error ?? "Couldn't add bar");
        return;
      }
      setBars((prev) =>
        [...prev.filter((b) => b.id !== created.id), created].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      onChange(created.id);
      setShowAdd(false);
      setNewName("");
      setNewWeight("");
    });
  }

  const pillClass = (isSelected: boolean) =>
    `relative px-3 py-2.5 text-sm rounded-md border-2 font-medium transition-all ${
      isSelected
        ? "border-blue-400 bg-blue-400/15 text-blue-300 shadow-[0_0_0_3px_rgba(96,165,250,0.15)]"
        : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
    }`;

  const isBarbellType = equipmentType === "barbell";

  return (
    <div>
      <Label>Specialty Bar</Label>
      <p className="text-xs text-muted-foreground mb-1">
        {isBarbellType
          ? "Plate math uses this bar's weight (Standard = 45 lb bar)"
          : "Assign a bar to enable plate math for this exercise"}
      </p>
      <div className="grid grid-cols-2 gap-2 mt-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={pillClass(value === null)}
        >
          {value === null && (
            <span className="absolute top-1 right-1.5 text-blue-300 text-xs">✓</span>
          )}
          {isBarbellType ? "Standard" : "None"}
          <span className="block text-xs font-normal opacity-70">
            {isBarbellType ? "45 lb bar" : "No plate math"}
          </span>
        </button>
        {bars.map((bar) => {
          const isSelected = value === bar.id;
          return (
            <button
              type="button"
              key={bar.id}
              onClick={() => onChange(bar.id)}
              className={pillClass(isSelected)}
            >
              {isSelected && (
                <span className="absolute top-1 right-1.5 text-blue-300 text-xs">✓</span>
              )}
              {bar.name}
              <span className="block text-xs font-normal opacity-70">
                {Number(bar.bar_weight)} lb bar
              </span>
            </button>
          );
        })}
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="px-3 py-2.5 text-sm rounded-md border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 font-medium transition-all"
          >
            + New Bar
          </button>
        )}
      </div>

      {showAdd && (
        <div className="mt-2 p-3 border border-border rounded-md space-y-2">
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <Input
              placeholder="e.g., Trap bar"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <Input
              type="number"
              inputMode="decimal"
              placeholder="lbs"
              value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
            />
          </div>
          {addError && <p className="text-xs text-red-300">{addError}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAdd(false);
                setAddError(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={!newName.trim() || !(parseFloat(newWeight) > 0) || isPending}
              className="flex-1"
            >
              {isPending ? "Adding..." : "Add Bar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
