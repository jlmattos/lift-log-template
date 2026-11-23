import Link from "next/link";
import { Card } from "@/components/ui/card";
import { BackHeader } from "@/components/back-header";
import { getAllPRs } from "@/actions/pr-timeline";
import { bodyPartLabel } from "@/lib/body-parts";
import { PillNav } from "@/components/pill-nav";

export const dynamic = "force-dynamic";

export default async function PRsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = params.filter === "current" ? "current" : "all";
  const all = await getAllPRs();
  const events = filter === "current" ? all.filter((e) => e.isCurrent) : all;

  // Group events by month for nicer scanning
  const groups = new Map<string, typeof events>();
  for (const e of events) {
    const key = e.date.slice(0, 7); // YYYY-MM
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const groupKeys = Array.from(groups.keys()).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader
        backHref="/more"
        title="PR Timeline"
        subtitle={`Every personal record ever, newest first · ${all.length} total · ${all.filter((e) => e.isCurrent).length} currently standing`}
      />

      <PillNav
        items={[
          { href: "/prs", label: "All PRs", active: filter === "all" },
          { href: "/prs?filter=current", label: "Current only", active: filter === "current" },
        ]}
      />

      {events.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">No PRs yet.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupKeys.map((monthKey) => {
            const monthEvents = groups.get(monthKey)!;
            const monthLabel = new Date(monthKey + "-15T12:00:00").toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            });
            return (
              <div key={monthKey}>
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">
                  {monthLabel} · {monthEvents.length}
                </h2>
                <div className="space-y-2">
                  {monthEvents.map((e, i) => (
                    <Link key={`${e.exerciseId}-${e.side}-${e.date}-${i}`} href={`/exercises/${e.exerciseId}`} prefetch>
                      <Card className={`p-3 hover:bg-accent/40 transition-colors cursor-pointer ${
                        e.isCurrent ? "ring-1 ring-emerald-400/30" : ""
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm truncate">{e.exerciseName}</p>
                              {e.side !== "both" && (
                                <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                                  e.side === "left" ? "bg-blue-400/15 text-blue-300" : "bg-orange-400/15 text-orange-300"
                                }`}>{e.side}</span>
                              )}
                              {e.isCurrent && (
                                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300">
                                  Current
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {e.bodyPart ? `${bodyPartLabel(e.bodyPart)} · ` : ""}
                              {new Date(e.date + "T12:00:00").toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-bold tabular-nums">
                              {Math.round(e.e1rm)}
                              <span className="text-[10px] font-normal text-muted-foreground ml-1">e1RM</span>
                            </p>
                            <p className="text-[11px] text-muted-foreground tabular-nums">
                              {e.reps} × {e.load} · +{e.jumpLbs} lbs
                            </p>
                          </div>
                        </div>
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
