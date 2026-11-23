import Link from "next/link";
import { Card } from "@/components/ui/card";
import { BackHeader } from "@/components/back-header";
import { getETAProjections, getGoalProjections, type ETARow, type GoalETARow } from "@/actions/eta";

export const dynamic = "force-dynamic";

function fmtETA(days: number): string {
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const CONFIDENCE_STYLE: Record<ETARow["confidence"], { label: string; bg: string; text: string }> = {
  high:   { label: "High",   bg: "bg-emerald-400/15", text: "text-emerald-300" },
  medium: { label: "Med",    bg: "bg-yellow-400/15",  text: "text-yellow-300"  },
  low:    { label: "Low",    bg: "bg-slate-400/15",   text: "text-slate-300"   },
};

export default async function ETAPage() {
  const [{ needsSetup, rows }, goals] = await Promise.all([
    getETAProjections(),
    getGoalProjections(),
  ]);

  // Goals work even without Strength Standards setup; only the tier section needs it.
  if (needsSetup && goals.length === 0) {
    return (
      <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
        <Header />
        <Card className="p-6 text-center space-y-3">
          <p className="text-sm">
            Set a goal on any exercise, or configure Strength Standards to project tier ETAs.
          </p>
          <Link href="/strength" className="inline-block text-sm bg-blue-400 text-background font-medium px-4 py-2 rounded">
            Set up Strength Standards
          </Link>
        </Card>
      </div>
    );
  }

  const withETA = rows.filter((r) => r.etaDays != null);
  const noETA = rows.filter((r) => r.etaDays == null);

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
      <Header />

      {/* Personal goals section */}
      {goals.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold px-1">
            Your goals
          </h2>
          {goals.map((g) => (
            <GoalRow key={g.exerciseId} g={g} />
          ))}
        </div>
      )}

      {needsSetup ? (
        <Card className="p-4 text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            Configure Strength Standards to also see tier-based projections.
          </p>
          <Link href="/strength" className="inline-block text-xs bg-blue-400 text-background font-medium px-3 py-1.5 rounded">
            Set up Strength Standards
          </Link>
        </Card>
      ) : (
      <p className="text-xs text-muted-foreground px-1">
        At your current trend (linear regression on last 8 sessions), here&apos;s when each benchmark lift hits the next StrengthLevel tier.
      </p>
      )}

      {withETA.length > 0 && (
        <div className="space-y-2">
          {withETA.map((r) => {
            const conf = CONFIDENCE_STYLE[r.confidence];
            return (
              <Link key={r.exerciseId} href={`/exercises/${r.exerciseId}`} prefetch>
                <Card className="p-4 hover:bg-accent/40 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{r.exerciseName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.standardLiftLabel} · currently <span className="text-foreground capitalize">{r.currentTier}</span>
                      </p>
                    </div>
                    <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${conf.bg} ${conf.text}`}>
                      {conf.label} conf
                    </span>
                  </div>

                  {/* ETA hero */}
                  <div className="flex items-baseline gap-3 mt-2">
                    <p className="text-2xl font-bold tabular-nums text-emerald-300">
                      {fmtETA(r.etaDays!)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      → <span className="capitalize text-foreground">{r.nextTier}</span> · {fmtDate(r.etaDate!)}
                    </p>
                  </div>

                  {/* Trajectory */}
                  <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                    <p>
                      e1RM <span className="text-foreground">{r.currentE1RM}</span> → <span className="text-foreground">{r.nextTierLbs}</span> lbs
                      <span className="ml-1">({r.gapLbs} to go)</span>
                    </p>
                    <p>
                      Trailing slope: <span className="text-emerald-300">+{r.slopeLbsPerWeek}</span> lbs/wk
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {noETA.length > 0 && (
        <div className="space-y-2 pt-2">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold px-1">
            Can&apos;t project
          </h2>
          {noETA.map((r) => (
            <Link key={r.exerciseId} href={`/exercises/${r.exerciseId}`} prefetch>
              <Card className="p-3 hover:bg-accent/40 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{r.exerciseName}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">{r.currentTier}</p>
                  </div>
                  {r.currentE1RM > 0 && (
                    <p className="text-xs text-muted-foreground tabular-nums">{r.currentE1RM} e1RM</p>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{r.reason}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Caveat */}
      <Card className="p-3 text-[11px] text-muted-foreground">
        Linear projection assumes you keep training as you have. Reality is usually slower as you approach a tier ceiling. Use as a directional signal, not a deadline.
      </Card>
    </div>
  );
}

function Header() {
  return (
    <BackHeader
      backHref="/more"
      title="Predictive ETA"
      subtitle="Goals + tier projections · at current trend"
    />
  );
}

const GOAL_STATUS_STYLE: Record<GoalETARow["status"], { label: string; bg: string; text: string }> = {
  achieved:   { label: "Reached",  bg: "bg-emerald-400/15", text: "text-emerald-300" },
  "on-track": { label: "On track", bg: "bg-emerald-400/15", text: "text-emerald-300" },
  behind:     { label: "Behind",   bg: "bg-amber-400/15",   text: "text-amber-300"   },
  stalled:    { label: "Stalled",  bg: "bg-orange-400/15",  text: "text-orange-300"  },
  "no-data":  { label: "No data",  bg: "bg-slate-400/15",   text: "text-slate-300"   },
};

function GoalRow({ g }: { g: GoalETARow }) {
  const style = GOAL_STATUS_STYLE[g.status];
  const achieved = g.status === "achieved";
  return (
    <Link href={`/exercises/${g.exerciseId}`} prefetch>
      <Card className={`p-4 hover:bg-accent/40 transition-colors cursor-pointer ${achieved ? "bg-emerald-400/5 border-emerald-400/30" : ""}`}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{g.exerciseName}</p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {g.currentE1RM} → {g.targetE1RM} lbs e1RM{g.gapLbs > 0 ? ` · ${g.gapLbs} to go` : ""}
            </p>
          </div>
          <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded shrink-0 ${style.bg} ${style.text}`}>
            {style.label}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${achieved ? "bg-emerald-400" : "bg-purple-400"}`}
            style={{ width: `${g.pctToGoal}%` }}
          />
        </div>

        <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground tabular-nums">
          <span>{g.pctToGoal}% there</span>
          {g.etaDate ? (
            <span className="text-emerald-300">ETA {fmtETA(g.etaDays!)} · {fmtDate(g.etaDate)}</span>
          ) : (
            <span>{g.reason}</span>
          )}
        </div>

        {g.targetDate && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Your deadline: {fmtDate(g.targetDate)}
            {g.status === "behind" && <span className="text-amber-300"> · projected to miss</span>}
            {g.status === "on-track" && g.etaDate && <span className="text-emerald-300"> · projected to hit it</span>}
          </p>
        )}
        {g.slopeLbsPerWeek != null && g.slopeLbsPerWeek > 0 && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Trailing slope: <span className="text-emerald-300">+{g.slopeLbsPerWeek}</span> lbs/wk
          </p>
        )}
      </Card>
    </Link>
  );
}
