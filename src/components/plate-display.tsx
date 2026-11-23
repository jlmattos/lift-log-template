"use client";

import { calculatePlates, formatBreakdown, DEFAULT_BAR_WEIGHT } from "@/lib/barbell";

export function PlateDisplay({
  targetWeight,
  barWeight = DEFAULT_BAR_WEIGHT,
}: {
  targetWeight: string;
  /** Empty-bar weight — 45 for a standard barbell, 50 for the trap bar, etc. */
  barWeight?: number;
}) {
  const num = parseFloat(targetWeight);
  if (!targetWeight || isNaN(num) || num <= 0) {
    return null;
  }

  const breakdown = calculatePlates(num, barWeight);
  // Flag non-standard bars so a "45, 25" readout isn't mistaken for a 45 lb bar.
  const barSuffix = barWeight !== DEFAULT_BAR_WEIGHT ? ` (bar ${barWeight})` : "";

  if (num < barWeight) {
    return (
      <div className="text-xs text-muted-foreground/70 px-2 py-1.5 bg-muted/40 rounded text-center">
        Below bar weight ({barWeight} lbs)
      </div>
    );
  }

  return (
    <div className="px-2 py-1.5 bg-muted/40 rounded">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          Per side{barSuffix}
        </span>
        <span className="text-sm font-mono font-medium">
          {formatBreakdown(breakdown)}
        </span>
      </div>
      {breakdown.remainder !== 0 && (
        <div className="text-xs text-amber-400/80 mt-1">
          {breakdown.remainder > 0
            ? `Can't reach exactly (off by ${breakdown.remainder} lbs)`
            : `Exceeds target by ${Math.abs(breakdown.remainder)} lbs`}
        </div>
      )}
    </div>
  );
}
