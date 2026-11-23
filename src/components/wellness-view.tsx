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
import { SymptomCorrelationCard } from "@/components/symptom-correlation-card";
import { BODY_PART_OPTIONS, bodyPartLabel } from "@/lib/body-parts";
import {
  createInjuryArea,
  updateInjuryArea,
  deleteInjuryArea,
  type InjuryArea,
} from "@/actions/symptoms";
import type { SymptomCorrelation } from "@/actions/correlation";

export function WellnessView({
  areas,
  correlations,
}: {
  areas: InjuryArea[];
  correlations: (SymptomCorrelation | null)[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<InjuryArea | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [relatedBodyParts, setRelatedBodyParts] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function openCreate() {
    setEditingArea(null);
    setName("");
    setDescription("");
    setRelatedBodyParts([]);
    setSheetOpen(true);
  }

  function openEdit(area: InjuryArea) {
    setEditingArea(area);
    setName(area.name);
    setDescription(area.description ?? "");
    setRelatedBodyParts(area.related_body_parts ?? []);
    setSheetOpen(true);
  }

  function togglePart(value: string) {
    setRelatedBodyParts((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function handleSave() {
    if (!name.trim()) return;
    startTransition(async () => {
      if (editingArea) {
        await updateInjuryArea(editingArea.id, { name, description, relatedBodyParts });
      } else {
        await createInjuryArea(name, description, relatedBodyParts);
      }
      setSheetOpen(false);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteInjuryArea(id);
      setConfirmDeleteId(null);
      router.refresh();
    });
  }

  const corrByArea = new Map(correlations.filter((c) => c).map((c) => [c!.area.id, c!]));

  return (
    <div className="space-y-4">
      {areas.length === 0 && (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No injury areas tracked yet. Add one to start daily check-ins.
          </p>
        </Card>
      )}

      {areas.map((area) => {
        const corr = corrByArea.get(area.id);
        return (
          <Card key={area.id} className="p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">{area.name}</h3>
                {area.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {area.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => openEdit(area)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
              >
                Edit
              </button>
            </div>

            {corr ? (
              <SymptomCorrelationCard data={corr} />
            ) : (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No data available yet.
              </p>
            )}

            {confirmDeleteId !== area.id ? (
              <button
                onClick={() => setConfirmDeleteId(area.id)}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors mt-3 block ml-auto"
              >
                Delete area
              </button>
            ) : (
              <div className="mt-3 p-2 border border-destructive/30 bg-destructive/5 rounded-md space-y-2">
                <p className="text-xs text-destructive">
                  Delete &ldquo;{area.name}&rdquo;? All check-ins for this area will be lost.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmDeleteId(null)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(area.id)}
                    disabled={isPending}
                    className="flex-1"
                  >
                    Yes, delete
                  </Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      <Button
        onClick={openCreate}
        variant="outline"
        className="w-full h-12 border-dashed text-muted-foreground"
      >
        + Add Injury Area
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingArea ? "Edit Area" : "New Injury Area"}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="areaName">Name</Label>
              <Input
                id="areaName"
                placeholder="e.g., Right Knee"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="areaDesc">Description (optional)</Label>
              <Input
                id="areaDesc"
                placeholder="e.g., Meniscus issue, flares on deep squats"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <Label>Related body parts</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Which muscle groups load this area? Used to correlate volume vs symptom severity.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {BODY_PART_OPTIONS.filter((o) => !["push", "pull", "legs", "other"].includes(o.value)).map((o) => {
                  const active = relatedBodyParts.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => togglePart(o.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        active
                          ? "bg-blue-400 text-background border-blue-400 font-medium"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {bodyPartLabel(o.value)}
                    </button>
                  );
                })}
              </div>
            </div>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || isPending}
              className="w-full h-12"
            >
              {isPending ? "Saving..." : editingArea ? "Save Changes" : "Add Area"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
