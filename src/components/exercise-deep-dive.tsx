"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
} from "recharts";
import type { DeepDiveData, SetPoint, RepMax, RepScheme } from "@/actions/deep-dive";

type Props = {
  isUnilateral: boolean;
  data: DeepDiveData;
};

type Side = "both" | "left" | "right";

export function ExerciseDeepDive({ isUnilateral, data }: Props) {
  // Default tab: unilateral → right (most have more R data), bilateral → both
  const [side, setSide] = useState<Side>(isUnilateral ? "right" : "both");

  const filteredSets = data.sets.filter((s) => s.side === side);
  const best = data.best[side];

  if (data.sets.length === 0) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Deep Dive
        </h2>
        {isUnilateral && (
          <div className="flex bg-muted/40 rounded-md p-0.5">
            <SideTab active={side === "left"} onClick={() => setSide("left")} color="blue">L</SideTab>
            <SideTab active={side === "right"} onClick={() => setSide("right")} color="orange">R</SideTab>
          </div>
        )}
      </div>

      {/* Trend + plateau callouts */}
      <div className="space-y-2 mb-4">
        {data.trend && (
          <TrendCallout trend={data.trend} />
        )}
        {data.plateau && (
          <PlateauCallout plateau={data.plateau} />
        )}
      </div>

      {/* Best RMs */}
      <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        Best by rep count
      </h3>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <RMCard label="1RM" rm={best.rm1} />
        <RMCard label="3RM" rm={best.rm3} />
        <RMCard label="5RM" rm={best.rm5} />
      </div>

      {/* Schemes */}
      {(best.scheme5x5 || best.scheme3x5) && (
        <>
          <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Best volume schemes
          </h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <SchemeCard scheme={best.scheme5x5} />
            <SchemeCard scheme={best.scheme3x5} />
          </div>
        </>
      )}

      {/* All-sets scatter */}
      <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        Every set · load over time
      </h3>
      {filteredSets.length >= 3 ? (
        <AllSetsScatter sets={filteredSets} />
      ) : (
        <p className="text-xs text-muted-foreground text-center py-4">
          Need at least 3 sets to plot.
        </p>
      )}
    </Card>
  );
}

function SideTab({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: "blue" | "orange";
  children: React.ReactNode;
}) {
  const bg = color === "blue" ? "bg-blue-400" : "bg-orange-400";
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded transition-colors ${
        active ? `${bg} text-background font-medium` : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function TrendCallout({ trend }: { trend: NonNullable<DeepDiveData["trend"]> }) {
  const sign = trend.slopeLbsPerWeek >= 0 ? "+" : "";
  const isPositive = trend.slopeLbsPerWeek > 0.1;
  const isNegative = trend.slopeLbsPerWeek < -0.1;
  const color = isPositive
    ? "text-emerald-300 bg-emerald-400/10 border-emerald-400/30"
    : isNegative
      ? "text-red-300 bg-red-400/10 border-red-400/30"
      : "text-muted-foreground bg-muted/40 border-border";
  const arrow = isPositive ? "↑" : isNegative ? "↓" : "→";
  return (
    <div className={`text-xs px-3 py-2 rounded border ${color}`}>
      <span className="font-semibold">{arrow} {sign}{trend.slopeLbsPerWeek} lbs/wk</span>{" "}
      <span className="opacity-70">trailing avg over {trend.sessions} sessions ({trend.earliestE1RM} → {trend.latestE1RM} e1RM)</span>
    </div>
  );
}

function PlateauCallout({ plateau }: { plateau: NonNullable<DeepDiveData["plateau"]> }) {
  return (
    <div className="text-xs px-3 py-2 rounded border border-yellow-400/30 bg-yellow-400/10 text-yellow-200">
      <span className="font-semibold">⏸ Plateau:</span>{" "}
      <span className="opacity-90">
        top load ({plateau.currentTopLoad} lbs) hasn&apos;t increased in {plateau.weeksFlat} weeks
      </span>
    </div>
  );
}

function RMCard({ label, rm }: { label: string; rm: RepMax }) {
  return (
    <div className="bg-muted/30 rounded p-2 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      {rm ? (
        <>
          <p className="text-lg font-bold tabular-nums">{rm.load}</p>
          <p className="text-[10px] text-muted-foreground">
            {new Date(rm.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground mt-1">—</p>
      )}
    </div>
  );
}

function SchemeCard({ scheme }: { scheme: RepScheme }) {
  return (
    <div className="bg-muted/30 rounded p-2 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Best {scheme?.scheme ?? "—"}
      </p>
      {scheme ? (
        <>
          <p className="text-lg font-bold tabular-nums">{scheme.load}</p>
          <p className="text-[10px] text-muted-foreground">
            {new Date(scheme.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground mt-1">—</p>
      )}
    </div>
  );
}

function AllSetsScatter({ sets }: { sets: SetPoint[] }) {
  // Recharts expects raw data — daysAgo is X (we'll show as negative-going), load is Y, reps is bubble size (Z)
  const points = sets.map((s) => ({
    x: -s.daysAgo, // negative so newer is to the right
    y: s.load,
    z: s.reps,
    date: s.date,
    reps: s.reps,
    load: s.load,
  }));

  const minX = Math.min(...points.map((p) => p.x));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[minX, 0]}
          tick={{ fontSize: 10, fill: "hsl(0 0% 60%)" }}
          stroke="hsl(0 0% 20%)"
          tickFormatter={(v) => `${-v}d`}
        />
        <YAxis
          type="number"
          dataKey="y"
          tick={{ fontSize: 10, fill: "hsl(0 0% 60%)" }}
          stroke="hsl(0 0% 20%)"
          width={36}
        />
        <ZAxis type="number" dataKey="z" range={[40, 240]} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          contentStyle={{
            backgroundColor: "hsl(0 0% 12%)",
            border: "1px solid hsl(0 0% 20%)",
            borderRadius: "8px",
            fontSize: "11px",
          }}
          labelStyle={{ color: "hsl(0 0% 80%)" }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(_v: any, _name: any, item: any) => {
            const d = item?.payload;
            if (!d) return ["", ""];
            return [`${d.reps} × ${d.load} lbs`, d.date];
          }}
          labelFormatter={() => ""}
        />
        <Scatter data={points} fill="#60a5fa" fillOpacity={0.55} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
