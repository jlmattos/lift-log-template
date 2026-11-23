import Link from "next/link";
import { Card } from "@/components/ui/card";
import { BackHeader } from "@/components/back-header";
import { listCardioSessions } from "@/actions/cardio";
import { getStravaConnectionInfo } from "@/lib/strava";
import { syncCardioAction } from "@/app/cardio/actions";
import { WINDOW_OPTIONS, parseWindowKey } from "@/lib/windows";
import { PillNav } from "@/components/pill-nav";
import { protocolModalityLabel } from "@/lib/cardio-protocols";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  ride: { label: "Ride", color: "bg-blue-400/15 text-blue-300", icon: "🚴" },
  run:  { label: "Run",  color: "bg-orange-400/15 text-orange-300", icon: "🏃" },
  row:  { label: "Row",  color: "bg-emerald-400/15 text-emerald-300", icon: "🚣" },
  hike: { label: "Hike", color: "bg-amber-400/15 text-amber-300", icon: "🥾" },
  walk: { label: "Walk", color: "bg-slate-400/15 text-slate-300", icon: "🚶" },
  other:{ label: "Other", color: "bg-muted text-muted-foreground", icon: "💪" },
};

function fmtDuration(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtDistance(m: number | null): string | null {
  if (!m) return null;
  const mi = m / 1609.34;
  return `${mi.toFixed(mi >= 10 ? 0 : 1)} mi`;
}

export default async function CardioPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; synced?: string; error?: string }>;
}) {
  const params = await searchParams;
  const windowKey = parseWindowKey(params.window, "30d");
  const daysBack = WINDOW_OPTIONS.find((w) => w.key === windowKey)?.days ?? 365 * 5;

  const [sessions, conn] = await Promise.all([
    listCardioSessions(daysBack),
    getStravaConnectionInfo(),
  ]);

  // Group by day for nice scanning
  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    if (!byDay.has(s.performed_on)) byDay.set(s.performed_on, []);
    byDay.get(s.performed_on)!.push(s);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => (a < b ? 1 : -1));

  // Summary
  const totalSessions = sessions.length;
  const totalLoad = sessions.reduce((s, x) => s + (x.estimated_load ?? 0), 0);
  const totalMin = sessions.reduce((s, x) => s + Number(x.duration_min), 0);

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader
        backHref="/more"
        title="Cardio"
        subtitle={conn ? `Synced from Strava as ${conn.athlete_name ?? `Athlete ${conn.athlete_id}`}` : "Not connected to Strava"}
      />

      {params.synced === "1" && (
        <Card className="p-3 bg-emerald-400/10 border-emerald-400/30">
          <p className="text-sm text-emerald-300">✓ Synced.</p>
        </Card>
      )}
      {params.error && (
        <Card className="p-3 bg-red-400/10 border-red-400/30">
          <p className="text-sm text-red-300">Sync failed: {decodeURIComponent(params.error)}</p>
        </Card>
      )}

      {!conn && (
        <Card className="p-4 text-center space-y-2">
          <p className="text-sm">Connect Strava first to start syncing.</p>
          <Link href="/integrations/strava" className="inline-block text-sm bg-blue-400 text-background font-medium px-4 py-2 rounded">
            Set up Strava
          </Link>
        </Card>
      )}

      {/* Window + sync row */}
      {conn && (
        <>
          <PillNav
            items={WINDOW_OPTIONS.map((opt) => ({
              href: `/cardio?window=${opt.key}`,
              label: opt.label,
              active: windowKey === opt.key,
            }))}
          />

          <form action={syncCardioAction}>
            <button
              type="submit"
              className="w-full text-sm border border-border rounded-md py-2 hover:bg-accent/40 transition-colors"
            >
              Sync now
            </button>
          </form>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2">
            <Card className="p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{totalSessions}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Sessions</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{fmtDuration(totalMin)}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Duration</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{Math.round(totalLoad)}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Load</p>
            </Card>
          </div>
        </>
      )}

      {conn && (
        <>
          {sessions.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No cardio sessions in this window.</p>
              <p className="text-xs text-muted-foreground mt-1">Tap Sync now to pull from Strava.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {days.map((d) => {
                const items = byDay.get(d)!;
                const dayLabel = new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "short", month: "short", day: "numeric",
                });
                return (
                  <div key={d}>
                    <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">
                      {dayLabel}
                    </h2>
                    <div className="space-y-2">
                      {items.map((s) => {
                        const t = TYPE_LABELS[s.type] ?? TYPE_LABELS.other;
                        const dist = fmtDistance(s.distance_m);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const sa = s as any;
                        const pmLabel = protocolModalityLabel(sa.protocol, sa.modality);
                        return (
                          <Card key={s.id} className="p-3">
                            <div className="flex items-start gap-3">
                              <span className="text-xl shrink-0" aria-hidden>{t.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-medium text-sm truncate">{s.name ?? t.label}</p>
                                  <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${t.color}`}>
                                    {t.label}
                                  </span>
                                </div>
                                {pmLabel && (
                                  <p className="text-[11px] text-foreground/70 mt-0.5">{pmLabel}</p>
                                )}
                                <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                                  {fmtDuration(Number(s.duration_min))}
                                  {dist && ` · ${dist}`}
                                  {s.avg_hr && ` · ${Math.round(Number(s.avg_hr))} bpm avg`}
                                  {s.avg_watts && ` · ${Math.round(Number(s.avg_watts))}W`}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-bold tabular-nums">{Math.round(Number(s.estimated_load ?? 0))}</p>
                                <p className="text-[10px] text-muted-foreground">load</p>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
