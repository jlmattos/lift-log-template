import Link from "next/link";
import { Card } from "@/components/ui/card";
import { BackHeader } from "@/components/back-header";
import { getTSB, type TSBStatus } from "@/actions/tsb";
import { TSBChart } from "@/components/tsb-chart";
import { WINDOW_OPTIONS, parseWindowKey } from "@/lib/windows";

export const dynamic = "force-dynamic";

const STATUS_INFO: Record<TSBStatus, { label: string; emoji: string; bg: string; text: string; description: string }> = {
  fresh: {
    label: "Fresh",
    emoji: "🟢",
    bg: "bg-emerald-400/10 border-emerald-400/30",
    text: "text-emerald-300",
    description: "Well-rested. Good day for a hard session or testing.",
  },
  neutral: {
    label: "Neutral",
    emoji: "⚪",
    bg: "bg-slate-400/10 border-slate-400/30",
    text: "text-slate-300",
    description: "Balanced. Train as planned.",
  },
  optimal: {
    label: "Optimal",
    emoji: "🟡",
    bg: "bg-yellow-400/10 border-yellow-400/30",
    text: "text-yellow-300",
    description: "Productive training zone. Some fatigue is normal here.",
  },
  pushing: {
    label: "Pushing",
    emoji: "🟠",
    bg: "bg-orange-400/10 border-orange-400/30",
    text: "text-orange-300",
    description: "Accumulating fatigue. Watch for symptoms. Consider lighter sessions.",
  },
  "high-risk": {
    label: "High risk",
    emoji: "🔴",
    bg: "bg-red-400/10 border-red-400/30",
    text: "text-red-300",
    description: "Heavy fatigue load. Schedule recovery; injury risk elevated.",
  },
};

function deltaArrow(d: number): string {
  if (d > 0.5) return `↑ +${d}`;
  if (d < -0.5) return `↓ ${d}`;
  return `→ ${d >= 0 ? "+" : ""}${d}`;
}

export default async function TSBPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const params = await searchParams;
  const validWindows = ["30d", "90d", "365d", "all"] as const;
  // Filter out 7d — not useful for TSB (window too short for CTL trend)
  const windowKey = parseWindowKey(params.window, "90d");
  const daysBack = WINDOW_OPTIONS.find((w) => w.key === windowKey)?.days ?? 365 * 5;

  const report = await getTSB(daysBack);
  const status = STATUS_INFO[report.status];
  const t = report.today;

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader
        backHref="/more"
        title="Training Stress Balance"
        subtitle="Fitness vs fatigue, strength + cardio"
      />

      {/* Window selector */}
      <div className="flex gap-1 bg-muted/40 rounded-md p-1">
        {validWindows.map((w) => (
          <Link
            key={w}
            href={`/tsb?window=${w}`}
            className={`flex-1 text-center text-sm py-2 rounded transition-colors ${
              windowKey === w
                ? "bg-blue-400 text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {WINDOW_OPTIONS.find((x) => x.key === w)?.label}
          </Link>
        ))}
      </div>

      {/* Today's reading */}
      {t ? (
        <Card className={`p-4 ${status.bg} border`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Today · {t.date}</p>
              <p className={`text-2xl font-bold mt-0.5 ${status.text}`}>
                {status.emoji} {status.label}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold tabular-nums">
                {t.tsb > 0 ? "+" : ""}{t.tsb}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">TSB</p>
            </div>
          </div>
          <p className="text-xs">{status.description}</p>
        </Card>
      ) : (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">Need at least a few weeks of training data to compute TSB.</p>
        </Card>
      )}

      {/* CTL / ATL stat row */}
      {t && (
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-300 tabular-nums">{t.ctl}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">CTL · Fitness</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">{deltaArrow(report.ctlDelta7d)} 7d</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-orange-300 tabular-nums">{t.atl}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">ATL · Fatigue</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">{deltaArrow(report.atlDelta7d)} 7d</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-2xl font-bold text-emerald-300 tabular-nums">
              {t.tsb > 0 ? "+" : ""}{t.tsb}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">TSB · Form</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">{deltaArrow(report.tsbDelta7d)} 7d</p>
          </Card>
        </div>
      )}

      {/* Chart */}
      {report.days.length > 0 && (
        <Card className="p-3">
          <div className="-mx-2">
            <TSBChart days={report.days} />
          </div>
          <div className="flex justify-around text-[10px] text-muted-foreground mt-1">
            <span><span className="inline-block w-3 h-0.5 align-middle bg-blue-400 mr-1" />CTL (42d)</span>
            <span><span className="inline-block w-3 h-0.5 align-middle bg-orange-400 mr-1" />ATL (7d)</span>
            <span><span className="inline-block w-3 h-0.5 align-middle bg-emerald-400 mr-1" />TSB (right)</span>
          </div>
        </Card>
      )}

      {/* Explainer */}
      <Card className="p-4 text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground">How to read this</p>
        <p>
          <strong className="text-blue-300">CTL</strong> = 42-day exponential average of daily training load.
          Slow-rolling. Goes up when you consistently train, down when you rest. Proxy for fitness.
        </p>
        <p>
          <strong className="text-orange-300">ATL</strong> = 7-day exponential average. Fast-rolling.
          Spikes after hard sessions. Proxy for fatigue.
        </p>
        <p>
          <strong className="text-emerald-300">TSB = CTL − ATL</strong>. Positive = fresh. Negative = fatigued.
          Sustained TSB &lt; -25 is when injury risk climbs.
        </p>
        <p className="pt-1">
          Daily load = strength volume (reps × lbs ÷ 200) + Strava cardio load. Same scale for both.
        </p>
      </Card>
    </div>
  );
}
