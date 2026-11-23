import { listWorkouts, getProgressData, getHeatmapCalendar } from "@/actions/workouts";
import { getRecentPRs } from "@/actions/sets";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TrainingHeatmap } from "@/components/training-heatmap";
import { BodyPartChart } from "@/components/body-part-chart";
import { roundE1RM } from "@/lib/e1rm";
import { formatVolume } from "@/lib/format";
import { PillNav } from "@/components/pill-nav";
import Link from "next/link";

export const dynamic = "force-dynamic";

function trendArrow(now: number, prev: number): { symbol: string; color: string; pct?: number } {
  if (prev === 0) return { symbol: "—", color: "text-muted-foreground" };
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct > 0) return { symbol: "↑", color: "text-green-400", pct };
  if (pct < 0) return { symbol: "↓", color: "text-orange-400", pct };
  return { symbol: "=", color: "text-muted-foreground" };
}

const WINDOW_OPTIONS = [
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: 365, label: "1y" },
  { value: 10000, label: "All" },
];

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const params = await searchParams;
  const requestedWindow = parseInt(params.window ?? "30");
  const daysBack = WINDOW_OPTIONS.find((o) => o.value === requestedWindow) ? requestedWindow : 30;

  // Run all queries in parallel
  const [progress, workouts, prs, calendar] = await Promise.all([
    getProgressData(daysBack),
    listWorkouts(10), // only 10 most recent for the inline list
    getRecentPRs(Math.min(daysBack, 30)),
    getHeatmapCalendar(),
  ]);

  const sessionTrend = trendArrow(progress.thisWeek.sessions, progress.lastWeek?.sessions ?? 0);
  const volTrend = trendArrow(progress.thisWeek.volume, progress.lastWeek?.volume ?? 0);

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Last {daysBack >= 10000 ? "all-time" : `${daysBack} days`} · {progress.totals.workouts} workouts · {formatVolume(progress.totals.volume)} lbs total
        </p>
      </div>

      {/* Window selector */}
      <PillNav
        padY="py-3"
        items={WINDOW_OPTIONS.map((opt) => ({
          href: `/progress?window=${opt.value}`,
          label: opt.label,
          active: daysBack === opt.value,
        }))}
      />

      {/* This week stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">This Week</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-3xl font-bold">{progress.thisWeek.sessions}</p>
            <p className="text-xs text-muted-foreground">sessions</p>
          </div>
          {sessionTrend.pct !== undefined && (
            <p className={`text-xs mt-1 ${sessionTrend.color}`}>
              {sessionTrend.symbol} {Math.abs(sessionTrend.pct)}% vs last week
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Volume</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-3xl font-bold">{formatVolume(progress.thisWeek.volume)}</p>
            <p className="text-xs text-muted-foreground">lbs</p>
          </div>
          {volTrend.pct !== undefined && (
            <p className={`text-xs mt-1 ${volTrend.color}`}>
              {volTrend.symbol} {Math.abs(volTrend.pct)}% vs last week
            </p>
          )}
        </Card>
      </div>

      {/* Training heatmap */}
      <Card className="p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
          Activity · 12 Weeks
        </h2>
        <TrainingHeatmap data={calendar} />
      </Card>

      {/* Body part volume */}
      {progress.weekly.some((w) => w.volume > 0) && (
        <Card className="p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
            Volume by Body Part
          </h2>
          <BodyPartChart data={progress.weekly} />
        </Card>
      )}

      {/* Recent PRs */}
      {prs.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">
            Recent PRs · Last {Math.min(daysBack, 30)} Days
          </h2>
          <div className="space-y-2">
            {prs.slice(0, 5).map((pr, i) => {
              const date = new Date(pr.date + "T12:00:00");
              const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const sideLabel = pr.side === "left" ? "L" : pr.side === "right" ? "R" : null;
              const sideColor = pr.side === "left" ? "text-blue-400" : pr.side === "right" ? "text-orange-400" : "";
              return (
                <Link key={i} href={`/exercises/${pr.exerciseId}`}>
                  <Card className="p-3 hover:bg-accent/50 transition-colors cursor-pointer border-amber-400/30 bg-amber-400/5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-base">🏆</span>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {pr.exerciseName}
                            {sideLabel && <span className={`ml-1 text-xs ${sideColor}`}>({sideLabel})</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {pr.reps}×{pr.load} · e1RM {roundE1RM(pr.e1rm)} · {dateStr}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Top exercises */}
      {progress.topExercises.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">
            Most Trained
          </h2>
          <div className="space-y-2">
            {progress.topExercises.map((ex) => (
              <Link key={ex.id} href={`/exercises/${ex.id}`}>
                <Card className="p-3 hover:bg-accent/50 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{ex.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {ex.sessions} session{ex.sessions !== 1 ? "s" : ""} · {formatVolume(ex.totalVolume)} lbs
                      </p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="m9 18 6-6-6-6" /></svg>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Recent workouts (just 10) + link to full history */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Recent Workouts
          </h2>
          <Link
            href="/workouts"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View full history →
          </Link>
        </div>
        <div className="space-y-2">
          {workouts.length === 0 && (
            <p className="text-muted-foreground text-center py-8 text-sm">No workouts yet.</p>
          )}
          {workouts.map((w) => {
            const date = new Date(w.performed_on + "T12:00:00");
            const dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
            return (
              <Link key={w.id} href={`/history/${w.id}`}>
                <Card className="p-3 hover:bg-accent/50 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-sm">{dateStr}</h3>
                      <p className="text-xs text-muted-foreground">
                        {w.exerciseCount} ex · {w.setCount} sets
                      </p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="m9 18 6-6-6-6" /></svg>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
