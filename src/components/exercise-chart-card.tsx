"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { AsymmetryChart } from "@/components/asymmetry-chart";
import { ProgressChart } from "@/components/progress-chart";

type Metric = "load" | "e1rm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ExerciseChartCard({ isUnilateral, data }: { isUnilateral: boolean; data: any[] }) {
  const [metric, setMetric] = useState<Metric>("e1rm");

  // Transform data based on metric
  const chartData = data.map((d) => {
    if (isUnilateral) {
      return metric === "e1rm"
        ? { date: d.date, left: d.leftE1RM, right: d.rightE1RM }
        : { date: d.date, left: d.left, right: d.right };
    }
    return metric === "e1rm"
      ? { date: d.date, load: d.e1rm }
      : { date: d.date, load: d.load };
  });

  return (
    <Card className="p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {metric === "e1rm" ? "Estimated 1RM" : "Top Set Load"} · Over Time
        </h2>
        <div className="flex bg-muted/40 rounded-md p-0.5">
          <button
            onClick={() => setMetric("e1rm")}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              metric === "e1rm"
                ? "bg-blue-400 text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            e1RM
          </button>
          <button
            onClick={() => setMetric("load")}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              metric === "load"
                ? "bg-blue-400 text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Load
          </button>
        </div>
      </div>
      {isUnilateral ? (
        <AsymmetryChart data={chartData as { date: string; left: number; right: number }[]} />
      ) : (
        <ProgressChart data={chartData as { date: string; load: number }[]} />
      )}
    </Card>
  );
}
