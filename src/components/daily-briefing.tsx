import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PrescriptionMarkdown } from "@/components/prescription-markdown";
import type { DailyBriefing, BriefingAlert, PlannedWorkout } from "@/actions/briefing";
import type { TSBStatus } from "@/actions/tsb";
import { formatVolume } from "@/lib/format";

const CARDIO_TYPE_META: Record<string, { label: string; emoji: string; bg: string; text: string }> = {
  ruck:        { label: "Ruck",            emoji: "🎒", bg: "bg-amber-400/10 border-amber-400/30",    text: "text-amber-300" },
  vo2:         { label: "VO2 intervals",   emoji: "🚴", bg: "bg-red-400/10 border-red-400/30",        text: "text-red-300" },
  zone_2:      { label: "Zone 2",          emoji: "🚲", bg: "bg-blue-400/10 border-blue-400/30",      text: "text-blue-300" },
  shred_shed:  { label: "Shred Shed",      emoji: "🪨", bg: "bg-orange-400/10 border-orange-400/30",  text: "text-orange-300" },
  z2_hiit:     { label: "Zone 2 + HIIT",   emoji: "🫀⚡", bg: "bg-violet-400/10 border-violet-400/30", text: "text-violet-300" },
  rest:        { label: "Rest day",        emoji: "🌿", bg: "bg-emerald-400/10 border-emerald-400/30", text: "text-emerald-300" },
  other:       { label: "Cardio",          emoji: "🏃", bg: "bg-muted",                                text: "text-muted-foreground" },
};

function PlannedSessionCard({ planned }: { planned: PlannedWorkout }) {
  // Pre-start: routine hasn't kicked off yet
  if (planned.routineStartsOn && planned.routineDaysUntilStart > 0) {
    const startDate = new Date(planned.routineStartsOn + "T12:00:00");
    const dayName = startDate.toLocaleDateString("en-US", { weekday: "long" });
    const monthDay = startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return (
      <Card className="p-4 border-emerald-400/30 bg-emerald-400/5">
        <p className="text-[10px] uppercase tracking-wider text-emerald-300 font-semibold">🌱 New routine starts soon</p>
        <p className="font-semibold text-base mt-1">{planned.routineName}</p>
        <p className="text-sm mt-2">
          Kicks off <span className="font-semibold text-emerald-300">{dayName}, {monthDay}</span>
          {" "}— that&apos;s in {planned.routineDaysUntilStart} day{planned.routineDaysUntilStart === 1 ? "" : "s"}.
        </p>
        <p className="text-[11px] text-muted-foreground mt-2">
          Use today as a rest/prep day. Week 1 begins with Lower on Monday.
        </p>
      </Card>
    );
  }

  // Cycle routines are untethered from weekdays: show position in the cycle
  // ("Day 4/9") and frame the card as "Up next" (advances by completion, not
  // by calendar date). Weekly routines keep the Wk/D calendar badge.
  const isCycle = planned.cycleDays != null;
  const planLabel = isCycle ? "Up next" : "Today's plan";
  const weekBadge = (
    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
      {isCycle
        ? `Day ${planned.dayNumber}/${planned.cycleDays}`
        : `Wk ${planned.routineCurrentWeek}/${planned.routineTotalWeeks} · D${planned.dayNumber}`}
    </span>
  );

  // Pure cardio day (no strength template)
  if (!planned.templateName && planned.cardioType) {
    const meta = CARDIO_TYPE_META[planned.cardioType] ?? CARDIO_TYPE_META.other;
    return (
      <Card className={`p-3 border ${meta.bg}`}>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="min-w-0">
            <p className={`text-[10px] uppercase tracking-wider font-semibold ${meta.text}`}>
              {meta.emoji} {planLabel}
            </p>
            <p className="font-semibold text-sm mt-0.5">{planned.cardioTemplateName ?? meta.label}</p>
          </div>
          {weekBadge}
        </div>
        <p className="text-[11px] text-muted-foreground">{planned.routineName}</p>
        {planned.weekNotes && (
          <div className="mt-2 border-l-2 border-blue-400/40 pl-2">
            <PrescriptionMarkdown content={planned.weekNotes} />
          </div>
        )}
        {!planned.weekNotes && planned.cardioNotes && (
          <p className="text-[11px] text-foreground/90 mt-1.5 leading-relaxed">{planned.cardioNotes}</p>
        )}
        {planned.cardioType !== "rest" && (
          <div className="mt-3">
            {planned.cardioTemplateId ? (
              planned.cardioLoggedToday ? (
                <span className="text-[11px] text-emerald-300 font-medium">✓ Logged today</span>
              ) : (
                <Link
                  href={`/cardio/log/${planned.cardioTemplateId}`}
                  className="text-xs bg-blue-400 text-background font-medium px-3 py-1.5 rounded inline-block"
                >
                  Log session →
                </Link>
              )
            ) : (
              <Link href="/cardio" className="text-[10px] text-muted-foreground/70 hover:text-foreground">
                Track in /cardio →
              </Link>
            )}
          </div>
        )}
      </Card>
    );
  }

  // Strength day (may also carry a cardio template as a finisher)
  return (
    <>
      <Card className="p-3 border-blue-400/30 bg-blue-400/5">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-blue-300 font-semibold">📋 {planLabel}</p>
            <p className="font-semibold text-sm mt-0.5 truncate">{planned.templateName}</p>
          </div>
          {weekBadge}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {planned.routineName} · {planned.totalExercises} exercise{planned.totalExercises === 1 ? "" : "s"}
        </p>
        {planned.weekNotes ? (
          <div className="mt-2 border-l-2 border-blue-400/40 pl-2">
            <PrescriptionMarkdown content={planned.weekNotes} />
          </div>
        ) : planned.exercisePreview.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
            {planned.exercisePreview.join(" · ")}
            {planned.totalExercises > planned.exercisePreview.length && (
              <span> · +{planned.totalExercises - planned.exercisePreview.length} more</span>
            )}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground/70 mt-2">Scroll down to start ↓</p>
      </Card>

      {/* Cardio finisher (e.g., Friday rower sprints) */}
      {planned.cardioTemplateId && (
        <Card className="p-3 border-orange-400/30 bg-orange-400/5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-orange-300 font-semibold">🚣 Finisher</p>
              <p className="text-sm font-medium mt-0.5">{planned.cardioTemplateName}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">After lifting</p>
            </div>
            {planned.cardioLoggedToday ? (
              <span className="text-[11px] text-emerald-300 font-medium self-center">✓ Logged</span>
            ) : (
              <Link
                href={`/cardio/log/${planned.cardioTemplateId}`}
                className="text-xs bg-orange-400 text-background font-medium px-3 py-1.5 rounded self-center"
              >
                Log →
              </Link>
            )}
          </div>
        </Card>
      )}
    </>
  );
}

const TSB_INFO: Record<TSBStatus, { label: string; emoji: string; bg: string; text: string; ring: string; hint: string }> = {
  fresh:        { label: "Fresh",      emoji: "🟢", bg: "bg-emerald-400/10", text: "text-emerald-300", ring: "border-emerald-400/40", hint: "Good day for a hard session." },
  neutral:      { label: "Neutral",    emoji: "⚪", bg: "bg-slate-400/10",   text: "text-slate-300",   ring: "border-slate-400/40",   hint: "Balanced — train as planned." },
  optimal:      { label: "Optimal",    emoji: "🟡", bg: "bg-yellow-400/10",  text: "text-yellow-300",  ring: "border-yellow-400/40",  hint: "Productive zone. Some fatigue is normal." },
  pushing:      { label: "Pushing",    emoji: "🟠", bg: "bg-orange-400/10",  text: "text-orange-300",  ring: "border-orange-400/40",  hint: "Accumulating fatigue — consider a lighter session." },
  "high-risk":  { label: "High risk",  emoji: "🔴", bg: "bg-red-400/10",     text: "text-red-300",     ring: "border-red-400/40",     hint: "Heavy fatigue — schedule recovery." },
};

const ALERT_STYLES: Record<BriefingAlert["severity"], { dot: string; text: string }> = {
  high: { dot: "bg-red-400",   text: "text-red-300" },
  warn: { dot: "bg-amber-400", text: "text-amber-300" },
};

function fmtETA(days: number): string {
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function DailyBriefing({ briefing, compact = false }: { briefing: DailyBriefing; compact?: boolean }) {
  // Compact mode: thin pill at top of page when workout is active
  if (compact) {
    return <CompactPill briefing={briefing} />;
  }

  const tsb = briefing.tsb;
  const tsbInfo = tsb ? TSB_INFO[tsb.status] : null;
  const weekProgress = "✓".repeat(Math.min(briefing.streak.weekWorkouts, briefing.streak.weekGoal)) +
    "○".repeat(Math.max(0, briefing.streak.weekGoal - briefing.streak.weekWorkouts));
  const weekExtra = Math.max(0, briefing.streak.weekWorkouts - briefing.streak.weekGoal);

  return (
    <div className="space-y-3 mt-4">
      {/* 1. Readiness banner — the hero */}
      {tsb && tsbInfo && (
        <Link href="/tsb" prefetch>
          <Card className={`p-4 border ${tsbInfo.ring} ${tsbInfo.bg} cursor-pointer transition-colors hover:bg-opacity-80`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Readiness</p>
                <p className={`text-2xl font-bold mt-0.5 ${tsbInfo.text}`}>
                  {tsbInfo.emoji} {tsbInfo.label}
                </p>
                <p className="text-xs mt-1 opacity-90">{tsbInfo.hint}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl font-bold tabular-nums">
                  {tsb.value > 0 ? "+" : ""}{tsb.value}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">TSB</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                  CTL {tsb.ctl} · ATL {tsb.atl}
                </p>
              </div>
            </div>
          </Card>
        </Link>
      )}

      {/* 2. Today's planned workout — anchor for what's about to happen */}
      {briefing.planned && <PlannedSessionCard planned={briefing.planned} />}

      {/* 3. Attention card — only when there are alerts */}
      {briefing.alerts.length > 0 && (
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            ⚠ Needs attention · {briefing.alerts.length}
          </p>
          <div className="space-y-1.5">
            {briefing.alerts.map((a, i) => {
              const style = ALERT_STYLES[a.severity];
              return (
                <Link key={i} href={a.href} prefetch>
                  <div className="flex items-center gap-2 text-sm hover:bg-accent/40 -mx-1 px-1 py-1 rounded transition-colors">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                    <span className={`flex-1 truncate ${style.text}`}>{a.text}</span>
                    <span className="text-muted-foreground text-xs">→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {/* 3. Streak + week progress */}
      <Link href="/streaks" prefetch>
        <Card className="p-3 cursor-pointer hover:bg-accent/40 transition-colors">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">🔥 Streak</p>
              <p className="text-lg font-bold tabular-nums mt-0.5">
                {briefing.streak.current}w
                {briefing.streak.current === briefing.streak.longest && briefing.streak.current > 1 && (
                  <span className="text-[10px] text-amber-300 ml-1.5 font-medium">PR</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">This week</p>
              <p className="text-lg font-mono tabular-nums mt-0.5">
                {weekProgress}{weekExtra > 0 && <span className="text-emerald-300">+{weekExtra}</span>}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {briefing.streak.weekWorkouts}/{briefing.streak.weekGoal} sessions
              </p>
            </div>
          </div>
        </Card>
      </Link>

      {/* 4. Coming up — closest ETAs */}
      {briefing.upcomingETAs.length > 0 && (
        <Link href="/eta" prefetch>
          <Card className="p-3 cursor-pointer hover:bg-accent/40 transition-colors">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">🎯 Coming up</p>
            <div className="space-y-1">
              {briefing.upcomingETAs.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{e.exerciseName}</span>
                  <span className="text-muted-foreground text-xs capitalize">→ {e.nextTier}</span>
                  <span className="text-emerald-300 font-semibold tabular-nums w-12 text-right">{fmtETA(e.etaDays)}</span>
                </div>
              ))}
            </div>
          </Card>
        </Link>
      )}

      {/* 5. Recent PR celebration */}
      {briefing.recentPR && (
        <Link href={`/exercises/${briefing.recentPR.exerciseId}`} prefetch>
          <Card className="p-3 bg-blue-400/5 border-blue-400/30 cursor-pointer hover:bg-blue-400/10 transition-colors">
            <p className="text-[10px] uppercase tracking-wider text-blue-300 font-semibold">🏆 Latest PR</p>
            <p className="text-sm mt-0.5">
              <span className="font-semibold">{briefing.recentPR.exerciseName}</span>
              {briefing.recentPR.side !== "both" && (
                <span className="text-[10px] uppercase ml-1.5 px-1 py-0.5 rounded bg-muted text-muted-foreground">{briefing.recentPR.side}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {briefing.recentPR.e1rm} e1RM · {briefing.recentPR.reps}×{briefing.recentPR.load} · {briefing.recentPR.daysAgo === 0 ? "today" : `${briefing.recentPR.daysAgo}d ago`}
            </p>
          </Card>
        </Link>
      )}

      {/* 6. Wellness nudge — encouraged daily logging */}
      {briefing.wellness.areaCount > 0 && briefing.wellness.checkinsToday < briefing.wellness.areaCount && (
        <Link href="/wellness" prefetch>
          <Card className="p-3 bg-amber-400/5 border-amber-400/30 cursor-pointer hover:bg-amber-400/10 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold">🩹 Wellness check</p>
                <p className="text-sm mt-0.5">
                  {briefing.wellness.checkinsToday === 0
                    ? `Log today's symptom check-in (${briefing.wellness.areaCount} area${briefing.wellness.areaCount > 1 ? "s" : ""})`
                    : `${briefing.wellness.areaCount - briefing.wellness.checkinsToday} area${briefing.wellness.areaCount - briefing.wellness.checkinsToday > 1 ? "s" : ""} left to log`}
                </p>
                {briefing.wellness.daysSinceLastCheckin != null && briefing.wellness.daysSinceLastCheckin >= 2 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">Last logged {briefing.wellness.daysSinceLastCheckin}d ago</p>
                )}
              </div>
              <span className="text-amber-300 text-xl">→</span>
            </div>
          </Card>
        </Link>
      )}

      {/* 7. 7-day snapshot */}
      <Link href="/progress" prefetch>
        <Card className="p-3 cursor-pointer hover:bg-accent/40 transition-colors">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">📊 Last 7 days</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Snapshot label="Workouts" value={briefing.snapshot.workouts.toString()} />
            <Snapshot label="Volume" value={formatVolume(briefing.snapshot.volume)} />
            <Snapshot label="Sets" value={briefing.snapshot.sets.toString()} />
            <Snapshot label="PRs" value={briefing.snapshot.prCount.toString()} highlight={briefing.snapshot.prCount > 0} />
          </div>
        </Card>
      </Link>
    </div>
  );
}

function Snapshot({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className={`text-lg font-bold tabular-nums ${highlight ? "text-blue-300" : ""}`}>{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

// Compact status pill shown when a workout is active
function CompactPill({ briefing }: { briefing: DailyBriefing }) {
  const tsb = briefing.tsb;
  const tsbInfo = tsb ? TSB_INFO[tsb.status] : null;
  const alertCount = briefing.alerts.length;

  return (
    <Link href="/tsb" prefetch>
      <div className="mt-3 flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/40 text-sm cursor-pointer hover:bg-muted/60 transition-colors">
        {tsbInfo && (
          <span className={tsbInfo.text}>
            {tsbInfo.emoji} {tsbInfo.label}
          </span>
        )}
        <span className="text-muted-foreground">·</span>
        <span>🔥 {briefing.streak.current}w</span>
        {alertCount > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-amber-300">⚠ {alertCount}</span>
          </>
        )}
        <span className="ml-auto text-muted-foreground text-xs">→</span>
      </div>
    </Link>
  );
}
