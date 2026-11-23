import Link from "next/link";
import { Card } from "@/components/ui/card";
import { BackHeader } from "@/components/back-header";
import { getLiftRatios, type RatioResult } from "@/actions/ratios";
import { WINDOW_OPTIONS, parseWindowKey } from "@/lib/windows";
import { PillNav } from "@/components/pill-nav";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<RatioResult["status"], { label: string; bg: string; text: string; barColor: string }> = {
  ok:      { label: "In range",  bg: "bg-emerald-400/15", text: "text-emerald-300", barColor: "#22c55e" },
  low:     { label: "Low",       bg: "bg-amber-400/15",   text: "text-amber-300",   barColor: "#f59e0b" },
  high:    { label: "High",      bg: "bg-amber-400/15",   text: "text-amber-300",   barColor: "#f59e0b" },
  missing: { label: "No data",   bg: "bg-muted",          text: "text-muted-foreground", barColor: "#3f3f46" },
};

export default async function RatiosPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const params = await searchParams;
  const windowKey = parseWindowKey(params.window, "90d");
  const days = WINDOW_OPTIONS.find((w) => w.key === windowKey)?.days ?? null;
  const report = await getLiftRatios(windowKey);

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader
        backHref="/more"
        title="Lift Ratios"
        subtitle={`Strength balance · ${days ? `last ${days} days` : "all-time peak"}`}
      />

      {/* Window selector */}
      <PillNav
        items={WINDOW_OPTIONS.map((opt) => ({
          href: `/ratios?window=${opt.key}`,
          label: opt.label,
          active: windowKey === opt.key,
        }))}
      />

      {report.needsSetup ? (
        <Card className="p-6 text-center space-y-3">
          <p className="text-sm">Needs your Strength Standards configured first.</p>
          <Link href="/strength" className="inline-block text-sm bg-blue-400 text-background font-medium px-4 py-2 rounded">
            Set up Strength Standards
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {report.results.map((r) => {
            const style = STATUS_STYLES[r.status];
            return (
              <Card key={r.def.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm">{r.def.label}</h3>
                    <p className="text-[11px] text-muted-foreground">{r.def.description}</p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                </div>

                {r.status === "missing" ? (
                  <p className="text-xs text-muted-foreground mt-3">
                    Need benchmark data for both lifts in this ratio (see /strength).
                  </p>
                ) : (
                  <>
                    {/* Ratio + comparison */}
                    <div className="flex items-baseline justify-between mt-3">
                      <p className="text-2xl font-bold tabular-nums">
                        {r.ratio?.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        target {r.def.targetMin.toFixed(2)}–{r.def.targetMax.toFixed(2)}
                      </p>
                    </div>

                    {/* Visual: range bar with marker */}
                    <RangeBar
                      ratio={r.ratio!}
                      min={r.def.targetMin}
                      max={r.def.targetMax}
                      barColor={style.barColor}
                    />

                    {/* Lifts */}
                    <div className="mt-3 text-[11px] text-muted-foreground space-y-0.5">
                      <p>
                        <span className="text-foreground tabular-nums">{r.numeratorE1RM}</span> lbs ·{" "}
                        {r.numeratorName}
                      </p>
                      <p>
                        <span className="text-foreground tabular-nums">{r.denominatorE1RM}</span> lbs ·{" "}
                        {r.denominatorName}
                      </p>
                    </div>

                    {(r.status === "low" || r.status === "high") && (
                      <p className={`text-[11px] mt-2 ${style.text}`}>
                        {r.deltaFromTarget}% {r.status === "low" ? "below" : "above"} target. {r.def.hint}
                      </p>
                    )}
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RangeBar({ ratio, min, max, barColor }: { ratio: number; min: number; max: number; barColor: string }) {
  // Scale bar from 0 to max*1.8 (or to ratio*1.1 if ratio is outside, whichever bigger)
  const scaleEnd = Math.max(max * 1.8, ratio * 1.1);
  const pct = (v: number) => Math.max(0, Math.min(100, (v / scaleEnd) * 100));

  return (
    <div className="mt-2 relative h-4 bg-muted/40 rounded">
      {/* Target band */}
      <div
        className="absolute h-full bg-emerald-400/25 border-x border-emerald-400/50"
        style={{ left: `${pct(min)}%`, width: `${pct(max) - pct(min)}%` }}
      />
      {/* Marker */}
      <div
        className="absolute h-full w-0.5 rounded"
        style={{ left: `${pct(ratio)}%`, background: barColor }}
      />
    </div>
  );
}
