"use client";

import { Card } from "@/components/ui/card";
import { bodyPartLabel } from "@/lib/body-parts";
import { SymptomCorrelationChart } from "@/components/symptom-correlation-chart";
import type { SymptomCorrelation } from "@/actions/correlation";

type Props = {
  data: SymptomCorrelation;
};

function rStrength(r: number): string {
  const a = Math.abs(r);
  if (a < 0.1) return "negligible";
  if (a < 0.3) return "weak";
  if (a < 0.5) return "moderate";
  if (a < 0.7) return "strong";
  return "very strong";
}

function rDirection(r: number): string {
  if (r > 0.05) return "positive";
  if (r < -0.05) return "negative";
  return "flat";
}

export function SymptomCorrelationCard({ data }: Props) {
  const hasRelated = data.area.related_body_parts.length > 0;
  const checkinCount = data.days.filter((d) => d.severity !== null).length;
  const hasAnyCheckin = checkinCount > 0;
  const hasAnyVolume = data.days.some((d) => d.relevantVolume > 0);
  const needsMoreData = checkinCount < 5;

  return (
    <div className="space-y-3">
      {/* Mapping summary */}
      {hasRelated ? (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1 self-center">
            Related to:
          </span>
          {data.area.related_body_parts.map((bp) => (
            <span
              key={bp}
              className="text-[11px] px-2 py-0.5 rounded-full bg-blue-400/15 text-blue-300"
            >
              {bodyPartLabel(bp)}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded px-3 py-2">
          ⚠ No body parts linked to this area yet. Tap Edit to pick which muscle groups to correlate against.
        </p>
      )}

      {/* Chart */}
      {hasAnyCheckin && hasAnyVolume ? (
        <div className="-mx-2">
          <SymptomCorrelationChart days={data.days} areaName={data.area.name} />
          <p className="text-[10px] text-muted-foreground/70 text-center mt-1">
            Orange line = severity (0-5). Blue bars = related-volume. Gray bars = other-volume.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-4 text-center">
          {hasAnyCheckin ? "No related-body-part volume in this window." : "No symptom check-ins logged in this window."}
        </p>
      )}

      {/* Needs-more-data hint */}
      {hasAnyCheckin && hasRelated && needsMoreData && (
        <p className="text-[11px] text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded px-3 py-2">
          Only {checkinCount} check-in{checkinCount === 1 ? "" : "s"} in this window — log daily symptom check-ins to unlock lag correlation analysis (needs ≥5).
        </p>
      )}

      {/* Insight callout */}
      {data.insight.deltaPct !== null && hasRelated && (
        <Card className={`p-3 ${
          data.insight.deltaPct > 15
            ? "bg-red-400/10 border-red-400/30"
            : data.insight.deltaPct < -15
              ? "bg-emerald-400/10 border-emerald-400/30"
              : "bg-muted/40"
        }`}>
          <p className="text-xs">
            <span className="font-semibold">
              {data.insight.deltaPct > 0 ? "↑" : "↓"} {Math.abs(data.insight.deltaPct)}%{" "}
              {data.insight.deltaPct > 0 ? "more" : "less"} severity
            </span>{" "}
            <span className="opacity-80">
              in the 3 days after high-volume days
              (&gt;{data.insight.highVolumeThreshold.toLocaleString()} lbs related volume).{" "}
              Avg {data.insight.avgSeverityAfterHighVolume} vs {data.insight.avgSeverityAfterLowVolume} (low days).
            </span>
          </p>
        </Card>
      )}

      {/* Lag correlation table */}
      {data.bestLag && hasRelated && (
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Lag correlation
          </p>
          <p className="text-xs mb-3 text-muted-foreground">
            Symptom severity vs related-body-part volume at lag <strong className="text-foreground">{data.bestLag.lagDays} day{data.bestLag.lagDays === 1 ? "" : "s"}</strong>:{" "}
            <span className={`font-semibold ${
              data.bestLag.pearsonR > 0.3 ? "text-red-300"
              : data.bestLag.pearsonR < -0.3 ? "text-emerald-300"
              : "text-muted-foreground"
            }`}>
              r = {data.bestLag.pearsonR > 0 ? "+" : ""}{data.bestLag.pearsonR.toFixed(2)}
            </span>{" "}
            ({rStrength(data.bestLag.pearsonR)} {rDirection(data.bestLag.pearsonR)})
          </p>
          <div className="grid grid-cols-4 gap-1 text-center">
            {data.lags.map((l) => (
              <div
                key={l.lagDays}
                className={`p-1.5 rounded text-xs ${
                  l === data.bestLag ? "bg-blue-400/20 ring-1 ring-blue-400" : "bg-muted/40"
                }`}
              >
                <p className="text-[9px] uppercase text-muted-foreground">Lag {l.lagDays}d</p>
                <p className="font-mono font-semibold mt-0.5">
                  {l.sampleSize < 5 ? "—" : `${l.pearsonR > 0 ? "+" : ""}${l.pearsonR.toFixed(2)}`}
                </p>
                <p className="text-[9px] text-muted-foreground">n={l.sampleSize}</p>
              </div>
            ))}
          </div>
          {data.bestLag.pearsonR > 0.2 && (
            <p className="text-[11px] text-amber-300 mt-2">
              💡 Pain tends to follow volume by ~{data.bestLag.lagDays} day{data.bestLag.lagDays === 1 ? "" : "s"} — consider lighter loading or longer recovery in this area.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
