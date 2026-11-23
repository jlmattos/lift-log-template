"use client";

import Link from "next/link";
import type { HeatmapCell } from "@/actions/workouts";

const CARDIO_META: Record<string, { label: string; icon: string }> = {
  ride: { label: "Ride", icon: "🚴" },
  run: { label: "Run", icon: "🏃" },
  row: { label: "Row", icon: "🚣" },
  hike: { label: "Hike", icon: "🥾" },
  walk: { label: "Walk", icon: "🚶" },
  other: { label: "Cardio", icon: "💪" },
};

function strengthIntensity(volume: number, max: number): string {
  const ratio = volume / max;
  if (ratio < 0.25) return "bg-blue-400/30";
  if (ratio < 0.5) return "bg-blue-400/50";
  if (ratio < 0.75) return "bg-blue-400/75";
  return "bg-blue-400";
}

function cardioIntensity(load: number, max: number): string {
  const ratio = load / max;
  if (ratio < 0.25) return "bg-orange-400/30";
  if (ratio < 0.5) return "bg-orange-400/50";
  if (ratio < 0.75) return "bg-orange-400/75";
  return "bg-orange-400";
}

function cellClass(cell: HeatmapCell, maxVolume: number, maxLoad: number): string {
  if (cell.isFuture) return "bg-transparent border border-border/30";
  const hasStrength = cell.workoutId !== null && cell.strengthVolume > 0;
  const hasCardio = cell.cardio.length > 0;
  if (hasStrength && hasCardio) {
    return "bg-gradient-to-br from-blue-400 to-orange-400";
  }
  if (hasStrength) return strengthIntensity(cell.strengthVolume, maxVolume);
  if (hasCardio) {
    const load = cell.cardio.reduce((s, c) => s + c.load, 0);
    return cardioIntensity(load, maxLoad);
  }
  return "bg-muted/30";
}

function cellHref(cell: HeatmapCell): string | null {
  if (cell.workoutId) return `/history/${cell.workoutId}`;
  if (cell.cardio.length > 0) return "/cardio";
  return null;
}

function fmtDuration(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function Popover({ cell, align }: { cell: HeatmapCell; align: "left" | "center" | "right" }) {
  const dateLabel = new Date(cell.date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const hasStrength = cell.workoutId !== null && cell.strengthVolume > 0;
  const hasCardio = cell.cardio.length > 0;
  const empty = !hasStrength && !hasCardio;

  const posClass =
    align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  const arrowClass =
    align === "left" ? "ml-1.5" : align === "right" ? "mr-1.5 ml-auto" : "mx-auto";

  return (
    <div className={`pointer-events-none absolute bottom-full z-50 mb-1.5 hidden group-hover:block ${posClass}`}>
      <div className="w-44 rounded-md border border-border bg-popover px-2.5 py-2 text-left shadow-lg">
        <p className="text-[11px] font-semibold text-foreground">{dateLabel}</p>
        {empty && <p className="mt-0.5 text-[11px] text-muted-foreground">Rest day</p>}

        {hasStrength && (
          <div className="mt-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-blue-300">
              Strength · {cell.setCount} sets · {Math.round(cell.strengthVolume).toLocaleString()} lbs
            </p>
            {cell.exercises.length > 0 && (
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {cell.exercises.slice(0, 4).join(", ")}
                {cell.exercises.length > 4 ? ` +${cell.exercises.length - 4}` : ""}
              </p>
            )}
          </div>
        )}

        {hasCardio && (
          <div className="mt-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-orange-300">
              Cardio
            </p>
            {cell.cardio.map((c, i) => {
              const meta = CARDIO_META[c.type] ?? CARDIO_META.other;
              return (
                <p key={i} className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {meta.icon} {c.name ?? meta.label} · {fmtDuration(c.durationMin)}
                </p>
              );
            })}
          </div>
        )}
      </div>
      <div className={`h-2 w-2 -translate-y-1 rotate-45 border-b border-r border-border bg-popover ${arrowClass}`} />
    </div>
  );
}

export function TrainingHeatmap({ data }: { data: HeatmapCell[] }) {
  const maxVolume = Math.max(...data.map((d) => d.strengthVolume), 1);
  const maxLoad = Math.max(
    ...data.map((d) => d.cardio.reduce((s, c) => s + c.load, 0)),
    1,
  );
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  const numWeeks = Math.ceil(data.length / 7);
  const weeks: HeatmapCell[][] = [];
  for (let w = 0; w < numWeeks; w++) {
    weeks.push(data.slice(w * 7, w * 7 + 7));
  }

  return (
    <div>
      <div className="flex gap-1.5">
        {/* Day labels */}
        <div className="flex flex-col gap-[3px] justify-around py-[1px]">
          {dayLabels.map((d, i) => (
            <span
              key={i}
              className="text-[10px] text-muted-foreground/60 h-3 flex items-center"
            >
              {i % 2 === 1 ? d : ""}
            </span>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex-1 flex flex-col gap-[3px]">
              {week.map((cell) => {
                const href = cellHref(cell);
                const className = `w-full aspect-square rounded-sm ${cellClass(cell, maxVolume, maxLoad)} ${cell.isToday ? "ring-1 ring-foreground" : ""}`;
                if (!href) {
                  return <div key={cell.date} className={className} />;
                }
                const align: "left" | "center" | "right" =
                  wi <= 1 ? "left" : wi >= numWeeks - 2 ? "right" : "center";
                return (
                  <Link
                    key={cell.date}
                    href={href}
                    className={`group relative block ${className} transition-transform hover:scale-110`}
                  >
                    <Popover cell={cell} align={align} />
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-400" /> Strength
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-orange-400" /> Cardio
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-br from-blue-400 to-orange-400" /> Both
        </span>
      </div>
    </div>
  );
}
