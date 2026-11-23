"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateE1RM, roundE1RM } from "@/lib/e1rm";

// Standard rep-range percentages of 1RM, from accepted strength tables
// (Prilepin / Boyle / standard programming).
const REP_TABLE: { reps: number; pct: number; label: string }[] = [
  { reps: 1, pct: 1.00, label: "1RM" },
  { reps: 2, pct: 0.95, label: "2RM (~95%)" },
  { reps: 3, pct: 0.92, label: "3RM (~92%)" },
  { reps: 5, pct: 0.87, label: "5RM (~87%)" },
  { reps: 8, pct: 0.80, label: "8RM (~80%)" },
  { reps: 10, pct: 0.75, label: "10RM (~75%)" },
  { reps: 12, pct: 0.70, label: "12RM (~70%)" },
  { reps: 15, pct: 0.65, label: "15RM (~65%)" },
];

export function OneRMCalculator() {
  const [weight, setWeight] = useState<string>("");
  const [reps, setReps] = useState<string>("");

  const w = parseFloat(weight);
  const r = parseInt(reps);
  const valid = w > 0 && r > 0 && r <= 30;

  const e1rm = useMemo(() => (valid ? calculateE1RM(w, r) : 0), [valid, w, r]);
  const rounded = useMemo(() => (e1rm > 0 ? roundE1RM(e1rm) : 0), [e1rm]);

  // Pick reasonable rounding for the table loads (nearest 2.5 for barbell, nearest 1 for DBs)
  const roundLoad = (v: number) => Math.round(v / 2.5) * 2.5;

  return (
    <>
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="weight" className="text-xs">Weight lifted</Label>
            <Input
              id="weight"
              type="number"
              inputMode="decimal"
              placeholder="e.g. 165"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="reps" className="text-xs">Reps completed</Label>
            <Input
              id="reps"
              type="number"
              inputMode="numeric"
              placeholder="e.g. 8"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {valid && e1rm > 0 && (
          <div className="mt-4 pt-4 border-t border-border text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Estimated 1RM</p>
            <p className="text-4xl font-bold tabular-nums text-blue-300 mt-1">{rounded}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {w} × {r} reps
            </p>
            {r > 10 && (
              <p className="text-[11px] text-amber-300 mt-2">
                ⚠ Above 10 reps the estimate gets less reliable. Treat as a rough ceiling.
              </p>
            )}
          </div>
        )}
      </Card>

      {valid && e1rm > 0 && (
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
            Training loads at this e1RM
          </p>
          <div className="space-y-1">
            {REP_TABLE.map((row) => {
              const load = roundLoad(e1rm * row.pct);
              return (
                <div key={row.reps} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="tabular-nums font-medium">{load} lbs</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground/70 mt-3">
            Loads rounded to nearest 2.5 lbs (barbell-friendly). Adjust for DB increments.
          </p>
        </Card>
      )}
    </>
  );
}
