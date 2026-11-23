import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getRecap, type PeriodKey } from "@/actions/recap";
import { formatVolume } from "@/lib/format";
import { BackHeader } from "@/components/back-header";

export const dynamic = "force-dynamic";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "year", label: "365d" },
  { key: "ytd", label: "YTD" },
  { key: "lastYear", label: "Last yr" },
  { key: "all", label: "All time" },
];

function trendBadge(pct: number | null): { symbol: string; color: string } | null {
  if (pct == null) return null;
  if (pct > 0) return { symbol: `+${pct}%`, color: "text-emerald-300" };
  if (pct < 0) return { symbol: `${pct}%`, color: "text-red-300" };
  return { symbol: "0%", color: "text-muted-foreground" };
}

export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const reqPeriod = (params.period as PeriodKey) ?? "year";
  const validPeriods: PeriodKey[] = ["year", "ytd", "lastYear", "all"];
  const period = validPeriods.includes(reqPeriod) ? reqPeriod : "year";

  const r = await getRecap(period);

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader
        backHref="/more"
        title="Recap"
        subtitle={`${r.label} · ${r.windowStart} → ${r.windowEnd}`}
      />

      {/* Period selector */}
      <div className="flex gap-1 bg-muted/40 rounded-md p-1">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/recap?period=${p.key}`}
            className={`flex-1 text-center text-sm py-2 rounded transition-colors ${
              period === p.key
                ? "bg-blue-400 text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {r.totalWorkouts === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">No workouts logged in this period.</p>
        </Card>
      ) : (
        <>
          {/* Hero stats */}
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Workouts" value={r.totalWorkouts.toString()} delta={r.yoy?.workoutsDeltaPct} />
            <Stat label="Volume" value={formatVolume(r.totalVolume)} sub="lbs" delta={r.yoy?.volumeDeltaPct} />
            <Stat label="Sets" value={r.totalSets.toLocaleString()} />
            <Stat label="Reps" value={r.totalReps.toLocaleString()} />
            <Stat label="PRs" value={r.prCount.toString()} delta={r.yoy?.prsDeltaPct} highlight />
            <Stat label="Longest streak" value={`${r.longestStreakWeeks}w`} sub={`${r.currentStreakWeeks}w current`} />
          </div>

          {/* Heaviest lift */}
          {r.heaviestLift && (
            <Card className="p-4 bg-blue-400/5 border-blue-400/30">
              <p className="text-[10px] uppercase tracking-wider text-blue-300 font-semibold">Heaviest single lift</p>
              <p className="text-2xl font-bold mt-1 tabular-nums">
                {r.heaviestLift.load} <span className="text-sm font-normal text-muted-foreground">lbs × {r.heaviestLift.reps}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {r.heaviestLift.exerciseName} · {new Date(r.heaviestLift.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </Card>
          )}

          {/* Most improved */}
          {r.mostImproved && (
            <Card className="p-4 bg-emerald-400/5 border-emerald-400/30">
              <p className="text-[10px] uppercase tracking-wider text-emerald-300 font-semibold">Most-improved exercise</p>
              <p className="font-semibold mt-1">{r.mostImproved.exerciseName}</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-emerald-300 tabular-nums">+{r.mostImproved.pctGain}%</span>
                <span className="text-xs text-muted-foreground">
                  e1RM {r.mostImproved.startE1RM} → {r.mostImproved.endE1RM} lbs
                </span>
              </div>
            </Card>
          )}

          {/* Most trained body part */}
          {r.mostTrainedBodyPart && (
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Most-trained body part</p>
              <p className="text-xl font-semibold mt-1">{r.mostTrainedBodyPart.bodyPartLabel}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {r.mostTrainedBodyPart.volume.toLocaleString()} lbs · {r.mostTrainedBodyPart.sets} sets
              </p>
            </Card>
          )}

          {/* Top exercises */}
          {r.topExercisesByVolume.length > 0 && (
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Top 5 exercises by volume</p>
              <div className="space-y-1">
                {r.topExercisesByVolume.map((e, i) => (
                  <div key={e.exerciseName} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground tabular-nums w-4">{i + 1}.</span>
                    <span className="flex-1 truncate">{e.exerciseName}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {e.volume.toLocaleString()} · {e.sets} sets
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  delta,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  highlight?: boolean;
}) {
  const trend = delta != null ? trendBadge(delta) : null;
  return (
    <Card className={`p-3 ${highlight ? "bg-blue-400/5 border-blue-400/30" : ""}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-xl font-bold mt-0.5 tabular-nums">
        {value}
        {sub && <span className="text-[10px] font-normal text-muted-foreground ml-1">{sub}</span>}
      </p>
      {trend && (
        <p className={`text-[11px] mt-0.5 ${trend.color}`}>{trend.symbol} YoY</p>
      )}
    </Card>
  );
}
