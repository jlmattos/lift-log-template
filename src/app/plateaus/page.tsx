import Link from "next/link";
import { Card } from "@/components/ui/card";
import { BackHeader } from "@/components/back-header";
import { getPlateauReport, type PlateauStatus } from "@/actions/plateaus";
import { bodyPartLabel } from "@/lib/body-parts";
import { PillNav } from "@/components/pill-nav";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<PlateauStatus, { label: string; bg: string; text: string; icon: string }> = {
  fresh:      { label: "Fresh",      bg: "bg-emerald-400/10 border-emerald-400/30", text: "text-emerald-300", icon: "🟢" },
  stalled:    { label: "Stalled",    bg: "bg-yellow-400/10 border-yellow-400/30",   text: "text-yellow-300",  icon: "🟡" },
  plateau:    { label: "Plateau",    bg: "bg-orange-400/10 border-orange-400/30",   text: "text-orange-300",  icon: "🟠" },
  stuck:      { label: "Stuck",      bg: "bg-red-400/10 border-red-400/30",         text: "text-red-300",     icon: "🔴" },
  regressing: { label: "Regressing", bg: "bg-purple-400/10 border-purple-400/30",   text: "text-purple-300",  icon: "🟣" },
};

export default async function PlateausPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = params.filter ?? "all";

  const { rows, totalExercisesEvaluated } = await getPlateauReport();

  const filtered = filter === "alerts"
    ? rows.filter((r) => r.status !== "fresh")
    : rows;

  // Group by status for nicer display
  const groups: Record<PlateauStatus, typeof rows> = {
    regressing: [],
    stuck: [],
    plateau: [],
    stalled: [],
    fresh: [],
  };
  for (const r of filtered) groups[r.status].push(r);

  const alertCount = rows.filter((r) => r.status !== "fresh").length;

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader
        backHref="/more"
        title="Plateau Detector"
        subtitle={`${alertCount} flagged · ${rows.length} actively trained · ${totalExercisesEvaluated} total`}
      />

      {/* Filter */}
      <PillNav
        items={[
          { href: "/plateaus", label: `All (${rows.length})`, active: filter === "all" },
          { href: "/plateaus?filter=alerts", label: `Alerts only (${alertCount})`, active: filter === "alerts" },
        ]}
      />

      {filtered.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "Need ≥6 sessions per exercise (and ≥3 in the last 90d) to evaluate."
              : "No alerts — everything's progressing."}
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {(Object.keys(groups) as PlateauStatus[]).map((status) => {
            const items = groups[status];
            if (items.length === 0) return null;
            const style = STATUS_STYLES[status];
            return (
              <div key={status}>
                <h2 className={`text-xs uppercase tracking-wider font-semibold mb-2 px-1 ${style.text}`}>
                  {style.icon} {style.label} · {items.length}
                </h2>
                <div className="space-y-2">
                  {items.map((r) => (
                    <Link key={r.exerciseId} href={`/exercises/${r.exerciseId}`} prefetch>
                      <Card className={`p-3 hover:bg-accent/40 transition-colors cursor-pointer ${style.bg} border`}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{r.exerciseName}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {r.bodyPart ? `${bodyPartLabel(r.bodyPart)} · ` : ""}
                              Peak {r.peakTopLoad} lbs on{" "}
                              {new Date(r.peakDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold tabular-nums">{r.weeksSincePeak}w</p>
                            <p className="text-[10px] text-muted-foreground">since peak</p>
                          </div>
                        </div>

                        {/* Slope bar */}
                        {r.slopeLbsPerWeek != null && (
                          <p className="text-[11px] tabular-nums">
                            <span className={r.slopeLbsPerWeek > 0.2 ? "text-emerald-300" : r.slopeLbsPerWeek < -0.2 ? "text-red-300" : "text-muted-foreground"}>
                              {r.slopeLbsPerWeek > 0 ? "↑" : r.slopeLbsPerWeek < 0 ? "↓" : "→"} {r.slopeLbsPerWeek > 0 ? "+" : ""}{r.slopeLbsPerWeek} lbs/wk
                            </span>
                            <span className="text-muted-foreground"> trailing slope · {r.sessionsSincePeak} sessions since peak</span>
                          </p>
                        )}

                        {status !== "fresh" && (
                          <p className={`text-[11px] mt-2 ${style.text}`}>
                            💡 {r.recommendation}
                          </p>
                        )}
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
