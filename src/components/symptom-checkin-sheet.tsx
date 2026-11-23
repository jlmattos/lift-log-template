"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { SeverityPicker } from "@/components/severity-picker";
import { saveCheckin, type InjuryArea, type SymptomCheckin } from "@/actions/symptoms";

type AreaState = {
  severity: number;
  affectedSleep: boolean;
  affectedWorkout: boolean;
  notes: string;
};

export function SymptomCheckinSheet({
  open,
  onOpenChange,
  date,
  areas,
  checkinsByArea,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  areas: InjuryArea[];
  checkinsByArea: Record<string, SymptomCheckin>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<Record<string, AreaState>>({});

  // Seed per-area state from existing check-ins when the sheet opens. Done
  // during render via previous-value tracking — React's sanctioned alternative
  // to a state-setting effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const next: Record<string, AreaState> = {};
      for (const a of areas) {
        const existing = checkinsByArea[a.id];
        next[a.id] = {
          severity: existing?.severity ?? 0,
          affectedSleep: existing?.affected_sleep ?? false,
          affectedWorkout: existing?.affected_workout ?? false,
          notes: existing?.notes ?? "",
        };
      }
      setState(next);
    }
  }

  function update(areaId: string, patch: Partial<AreaState>) {
    setState((prev) => ({ ...prev, [areaId]: { ...prev[areaId], ...patch } }));
  }

  function handleSave() {
    startTransition(async () => {
      for (const area of areas) {
        const s = state[area.id];
        if (!s) continue;
        await saveCheckin(area.id, {
          severity: s.severity,
          affectedSleep: s.affectedSleep,
          affectedWorkout: s.affectedWorkout,
          notes: s.notes,
          date,
        });
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  const friendlyDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Symptom Check-in</SheetTitle>
          <p className="text-xs text-muted-foreground">{friendlyDate}</p>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          {areas.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No injury areas yet.{" "}
              <a href="/wellness" className="underline">
                Add one
              </a>
              .
            </p>
          )}

          {areas.map((area, idx) => {
            const s = state[area.id];
            if (!s) return null;
            return (
              <div key={area.id} className="space-y-3">
                {idx > 0 && <Separator />}
                <div>
                  <Label className="text-base font-semibold">{area.name}</Label>
                  {area.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {area.description}
                    </p>
                  )}
                </div>

                <SeverityPicker
                  value={s.severity}
                  onChange={(v) => update(area.id, { severity: v })}
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between py-1">
                    <Label className="text-sm">Affected sleep last night</Label>
                    <Switch
                      checked={s.affectedSleep}
                      onCheckedChange={(v) => update(area.id, { affectedSleep: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <Label className="text-sm">Affected workout today</Label>
                    <Switch
                      checked={s.affectedWorkout}
                      onCheckedChange={(v) => update(area.id, { affectedWorkout: v })}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
                  <Input
                    placeholder="e.g., dull ache when reaching overhead"
                    value={s.notes}
                    onChange={(e) => update(area.id, { notes: e.target.value })}
                  />
                </div>
              </div>
            );
          })}

          {areas.length > 0 && (
            <Button
              onClick={handleSave}
              disabled={isPending}
              className="w-full h-12 sticky bottom-0"
            >
              {isPending ? "Saving..." : "Save Check-in"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
