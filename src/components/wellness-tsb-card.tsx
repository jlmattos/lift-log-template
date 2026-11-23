import { Card } from "@/components/ui/card";
import type { WellnessTSBInsight } from "@/actions/wellness-tsb";

export function WellnessTSBCard({ insight }: { insight: WellnessTSBInsight }) {
  const hasFinding = insight.threshold != null && insight.deltaPct != null;

  return (
    <Card
      className={`p-4 ${
        insight.inDangerZone
          ? "bg-red-400/10 border-red-400/40"
          : hasFinding
            ? "bg-amber-400/5 border-amber-400/30"
            : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Fatigue × Symptoms
        </p>
        {insight.todayTsb != null && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            today TSB {insight.todayTsb >= 0 ? "+" : ""}{insight.todayTsb}
          </span>
        )}
      </div>

      <p className={`text-sm ${insight.inDangerZone ? "text-red-200" : ""}`}>
        {insight.headline}
      </p>

      {hasFinding && (
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div>
            <p className="text-lg font-bold tabular-nums text-red-300">{insight.avgSeverityBelow}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
              avg below {insight.threshold! >= 0 ? "+" : ""}{insight.threshold}
            </p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-emerald-300">{insight.avgSeverityAtOrAbove}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">avg above</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums">{insight.deltaPct}%</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">worse</p>
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-3">
        Based on {insight.sampleSize} day{insight.sampleSize !== 1 ? "s" : ""} with both a check-in and a fitness reading
        {insight.pearsonR != null ? ` · r=${insight.pearsonR}` : ""} · last {insight.windowDays} days
      </p>
    </Card>
  );
}
