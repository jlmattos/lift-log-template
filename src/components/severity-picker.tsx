"use client";

import { SEVERITY_LABELS } from "@/lib/symptoms";

const COLORS = [
  "bg-emerald-500/20 border-emerald-500 text-emerald-300",
  "bg-lime-500/20 border-lime-500 text-lime-300",
  "bg-yellow-500/20 border-yellow-500 text-yellow-300",
  "bg-amber-500/20 border-amber-500 text-amber-300",
  "bg-orange-500/20 border-orange-500 text-orange-300",
  "bg-red-500/20 border-red-500 text-red-300",
];

const INACTIVE = "bg-background border-border text-muted-foreground";

export function SeverityPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((n) => {
          const isSelected = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`h-12 rounded-md border-2 font-bold text-base transition-all ${
                isSelected
                  ? COLORS[n] + " shadow-[0_0_0_2px_rgba(255,255,255,0.05)]"
                  : INACTIVE + " hover:text-foreground"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground text-center mt-1">
        {SEVERITY_LABELS[value]}
      </p>
    </div>
  );
}

export function SeverityDot({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/30" />;
  }
  const colorClass = [
    "bg-emerald-400",
    "bg-lime-400",
    "bg-yellow-400",
    "bg-amber-400",
    "bg-orange-400",
    "bg-red-400",
  ][value];
  return <span className={`inline-block w-2 h-2 rounded-full ${colorClass}`} />;
}
