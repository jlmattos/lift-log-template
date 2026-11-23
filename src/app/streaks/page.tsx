import Link from "next/link";
import { Card } from "@/components/ui/card";
import { BackHeader } from "@/components/back-header";
import { getStreakReport } from "@/actions/streak";

export const dynamic = "force-dynamic";

const GOAL_OPTIONS = [2, 3, 4];

export default async function StreaksPage({
  searchParams,
}: {
  searchParams: Promise<{ goal?: string }>;
}) {
  const params = await searchParams;
  const reqGoal = parseInt(params.goal ?? "3");
  const goal = GOAL_OPTIONS.includes(reqGoal) ? reqGoal : 3;

  const report = await getStreakReport(goal);

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader
        backHref="/more"
        title="Streaks"
        subtitle={`Weekly training consistency · ≥${goal} workouts/week to hit goal`}
      />

      {/* Goal selector */}
      <div className="flex gap-1 bg-muted/40 rounded-md p-1">
        {GOAL_OPTIONS.map((g) => (
          <Link
            key={g}
            href={`/streaks?goal=${g}`}
            className={`flex-1 text-center text-sm py-2 rounded transition-colors ${
              goal === g
                ? "bg-blue-400 text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {g}×/wk
          </Link>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-4 text-center bg-emerald-400/5 border-emerald-400/30">
          <p className="text-3xl font-bold tabular-nums text-emerald-300">{report.currentStreak}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Current streak</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-3xl font-bold tabular-nums">{report.longestStreak}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Longest streak</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-3xl font-bold tabular-nums">{report.hitRate}<span className="text-base font-normal">%</span></p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Hit rate ({report.totalWeeksTracked} wks)</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-3xl font-bold tabular-nums">{report.weeksWithoutAnyWorkout}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Off weeks</p>
        </Card>
      </div>

      {/* Calendar dot grid — newest left, ~52 weeks per row */}
      <Card className="p-4">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
          Week by week · {report.weeks.length} weeks tracked
        </h3>
        <div className="flex flex-wrap gap-1">
          {report.weeks.map((w) => {
            const color =
              w.workouts === 0
                ? "bg-muted/40"
                : w.hitGoal
                  ? "bg-emerald-400"
                  : "bg-amber-400/60";
            return (
              <div
                key={w.weekStart}
                title={`Week of ${w.weekStart} · ${w.workouts} workout${w.workouts === 1 ? "" : "s"}`}
                className={`w-4 h-4 rounded-sm ${color}`}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-3">
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-emerald-400" /> Hit goal</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-amber-400/60" /> Some training</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-muted/40" /> Off</span>
        </div>
      </Card>

      {/* Most-recent weeks list */}
      <Card className="p-4">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
          Recent weeks
        </h3>
        <div className="space-y-1">
          {report.weeks.slice(0, 12).map((w) => {
            const label = new Date(w.weekStart + "T12:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            return (
              <div key={w.weekStart} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums w-6 text-right">{w.workouts}</span>
                  <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                    w.hitGoal ? "bg-emerald-400/15 text-emerald-300" :
                    w.workouts > 0 ? "bg-amber-400/15 text-amber-300" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {w.hitGoal ? "Goal" : w.workouts > 0 ? "Below" : "Off"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
