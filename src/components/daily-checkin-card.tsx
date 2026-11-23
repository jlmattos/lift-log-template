"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { SeverityDot } from "@/components/severity-picker";
import { SymptomCheckinSheet } from "@/components/symptom-checkin-sheet";
import type { InjuryArea, SymptomCheckin } from "@/actions/symptoms";

export function DailyCheckinCard({
  date,
  areas,
  checkinsByArea,
}: {
  date: string;
  areas: InjuryArea[];
  checkinsByArea: Record<string, SymptomCheckin>;
}) {
  const [open, setOpen] = useState(false);

  if (areas.length === 0) return null;

  const loggedCount = Object.keys(checkinsByArea).length;
  const allLogged = loggedCount === areas.length;

  // Surface concerning signals
  const hasAffectedSleep = Object.values(checkinsByArea).some((c) => c.affected_sleep);
  const hasAffectedWorkout = Object.values(checkinsByArea).some((c) => c.affected_workout);
  const flags: string[] = [];
  if (hasAffectedSleep) flags.push("affected sleep");
  if (hasAffectedWorkout) flags.push("affected workout");

  return (
    <>
      <Card
        className="p-3 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Daily Check-in {allLogged ? "✓" : ""}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              {areas.map((a) => {
                const c = checkinsByArea[a.id];
                return (
                  <div key={a.id} className="flex items-center gap-1.5 text-xs">
                    <SeverityDot value={c?.severity ?? null} />
                    <span className="text-foreground/90">
                      {a.name}
                      {c ? `: ${c.severity}` : (
                        <span className="text-muted-foreground/60"> ·</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {flags.length > 0 && (
              <p className="text-xs text-amber-300/80 mt-1">
                ⚠ {flags.join(" · ")}
              </p>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {allLogged ? "Edit" : "Log"} →
          </span>
        </div>
      </Card>

      <SymptomCheckinSheet
        open={open}
        onOpenChange={setOpen}
        date={date}
        areas={areas}
        checkinsByArea={checkinsByArea}
      />
    </>
  );
}
