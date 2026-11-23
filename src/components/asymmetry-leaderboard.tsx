"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { bodyPartLabel } from "@/lib/body-parts";
import type { AsymmetryRow } from "@/actions/asymmetry";

type Props = {
  rows: AsymmetryRow[];
  windowDays: number;
};

type Filter = "all" | "alerts" | "left-weak" | "right-weak";

const TIER_STYLES: Record<AsymmetryRow["tier"], { label: string; bg: string; text: string }> = {
  none:   { label: "OK",      bg: "bg-emerald-400/15", text: "text-emerald-300" },
  low:    { label: "Watch",   bg: "bg-yellow-400/15",  text: "text-yellow-300"  },
  medium: { label: "Notable", bg: "bg-orange-400/15",  text: "text-orange-300"  },
  high:   { label: "High",    bg: "bg-red-400/15",     text: "text-red-300"     },
};

export function AsymmetryLeaderboard({ rows, windowDays }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    switch (filter) {
      case "alerts":
        return rows.filter((r) => r.tier !== "none");
      case "left-weak":
        return rows.filter((r) => r.weakerSide === "left");
      case "right-weak":
        return rows.filter((r) => r.weakerSide === "right");
      default:
        return rows;
    }
  }, [rows, filter]);

  // Summary stats
  const counts = useMemo(() => ({
    total: rows.length,
    alerts: rows.filter((r) => r.tier !== "none").length,
    leftWeak: rows.filter((r) => r.weakerSide === "left").length,
    rightWeak: rows.filter((r) => r.weakerSide === "right").length,
    avgGap: rows.length
      ? Math.round((rows.reduce((s, r) => s + r.gapPct, 0) / rows.length) * 10) / 10
      : 0,
  }), [rows]);

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <Card className="p-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label="Tracked" value={counts.total.toString()} />
          <Stat label="Alerts" value={counts.alerts.toString()} highlight={counts.alerts > 0} />
          <Stat label="L weak" value={counts.leftWeak.toString()} accent="blue" />
          <Stat label="R weak" value={counts.rightWeak.toString()} accent="orange" />
        </div>
        {counts.total > 0 && (
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Average gap: <span className="font-medium text-foreground">{counts.avgGap}%</span> · last {windowDays}d
          </p>
        )}
      </Card>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-md p-1">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>All</FilterButton>
        <FilterButton active={filter === "alerts"} onClick={() => setFilter("alerts")}>≥5%</FilterButton>
        <FilterButton active={filter === "left-weak"} onClick={() => setFilter("left-weak")}>L weak</FilterButton>
        <FilterButton active={filter === "right-weak"} onClick={() => setFilter("right-weak")}>R weak</FilterButton>
      </div>

      {/* Rows */}
      {filtered.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "No unilateral lifts logged in this window."
              : "Nothing matches this filter."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Link key={r.exerciseId} href={`/exercises/${r.exerciseId}`} prefetch>
              <Card className="p-3 hover:bg-accent/40 transition-colors cursor-pointer">
                <Row row={r} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
  accent,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  accent?: "blue" | "orange";
}) {
  const color =
    accent === "blue" ? "text-blue-400"
    : accent === "orange" ? "text-orange-400"
    : highlight ? "text-red-400"
    : "text-foreground";
  return (
    <div>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-center text-xs py-2 rounded transition-colors ${
        active
          ? "bg-blue-400 text-background font-medium"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ row }: { row: AsymmetryRow }) {
  const tierStyle = TIER_STYLES[row.tier];
  const max = Math.max(row.leftE1RM, row.rightE1RM);

  // Trend arrow on the gap delta (negative delta = gap closing = good)
  let trend: { symbol: string; color: string; text: string } | null = null;
  if (row.gapDelta != null && Math.abs(row.gapDelta) >= 0.5) {
    if (row.gapDelta < 0) {
      trend = { symbol: "↓", color: "text-emerald-400", text: `closing ${Math.abs(row.gapDelta).toFixed(1)}pp` };
    } else {
      trend = { symbol: "↑", color: "text-red-400", text: `widening ${row.gapDelta.toFixed(1)}pp` };
    }
  } else if (row.gapDelta != null) {
    trend = { symbol: "→", color: "text-muted-foreground", text: "stable" };
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{row.exerciseName}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.bodyPart ? `${bodyPartLabel(row.bodyPart)} · ` : ""}
            L {row.leftSets} sets · R {row.rightSets} sets
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${tierStyle.bg} ${tierStyle.text}`}>
            {tierStyle.label}
          </span>
          <span className="text-sm font-bold tabular-nums">{row.gapPct}%</span>
        </div>
      </div>

      {/* Bars */}
      <div className="space-y-1">
        <SideBar
          side="L"
          value={row.leftE1RM}
          max={max}
          color="bg-blue-400"
          isWeaker={row.weakerSide === "left"}
        />
        <SideBar
          side="R"
          value={row.rightE1RM}
          max={max}
          color="bg-orange-400"
          isWeaker={row.weakerSide === "right"}
        />
      </div>

      {trend && (
        <p className={`text-[11px] ${trend.color}`}>
          {trend.symbol} {trend.text} <span className="text-muted-foreground">vs prior {row.gapDelta != null ? "window" : ""}</span>
        </p>
      )}
    </div>
  );
}

function SideBar({
  side,
  value,
  max,
  color,
  isWeaker,
}: {
  side: string;
  value: number;
  max: number;
  color: string;
  isWeaker: boolean;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] font-mono w-3 ${isWeaker ? "text-muted-foreground" : ""}`}>{side}</span>
      <div className="flex-1 h-3 bg-muted/40 rounded-sm overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums w-12 text-right">{value}</span>
    </div>
  );
}
