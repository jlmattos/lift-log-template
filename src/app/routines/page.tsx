import { listRoutinesWithSchedule } from "@/actions/routines";
import { Card } from "@/components/ui/card";
import { CreateRoutineButton } from "@/components/create-routine-button";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RoutinesPage() {
  const routines = await listRoutinesWithSchedule();

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight">Routines</h1>
      <p className="text-muted-foreground text-sm mt-1">
        Multi-week programs. One can be active at a time.
      </p>

      <div className="mt-6 space-y-3">
        {routines.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            No routines yet. Build one from your templates.
          </p>
        )}

        {routines.map((r) => {
          // Build a lookup map of week-day → { strength, cardio }
          type DayInfo = { strength?: string; cardio?: string };
          const lookup = new Map<string, DayInfo>();
          for (const d of r.days) {
            const key = `${d.weekNumber}-${d.dayNumber}`;
            const cur = lookup.get(key) ?? {};
            if (d.templateName) cur.strength = d.templateName;
            if (d.cardioTemplateName) cur.cardio = d.cardioTemplateName;
            lookup.set(key, cur);
          }

          return (
            <Link key={r.id} href={`/routines/${r.id}`}>
              <Card
                className={`p-4 hover:bg-accent/50 transition-colors cursor-pointer ${
                  r.is_active ? "border-blue-400 border-2" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">{r.name}</h3>
                      {r.is_active && (
                        <span className="text-xs bg-blue-400/20 text-blue-300 px-1.5 py-0.5 rounded font-medium">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.cycle_days != null
                        ? `${r.cycle_days}-day cycle`
                        : `${r.weeks} week${r.weeks !== 1 ? "s" : ""}`}
                      {r.is_active && r.started_on
                        ? ` · started ${new Date(r.started_on + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                        : ""}
                    </p>
                  </div>
                </div>

                {/* Mini schedule grid (weekly rows, or one N-day cycle row) */}
                {r.days.length > 0 && (
                  <div className="space-y-1.5">
                    {Array.from({ length: r.cycle_days != null ? 1 : r.weeks }, (_, w) => {
                      const weekNum = w + 1;
                      const cells =
                        r.cycle_days != null
                          ? Array.from({ length: r.cycle_days }, (_, i) => i + 1)
                          : [1, 2, 3, 4, 5, 6, 7];
                      return (
                        <div key={weekNum} className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 w-8 shrink-0">
                            {r.cycle_days != null ? "CYC" : `W${weekNum}`}
                          </span>
                          <div className="flex-1 grid grid-cols-7 gap-0.5">
                            {cells.map((dayNum) => {
                              const info = lookup.get(`${weekNum}-${dayNum}`) ?? {};
                              const both = info.strength && info.cardio;
                              const onlyStrength = info.strength && !info.cardio;
                              const onlyCardio = info.cardio && !info.strength;
                              // Display preference: show strength label if present, else cardio
                              const label = info.strength
                                ? info.strength.replace(/Day \d+ - Week \d+|—.*/g, "").trim().slice(0, 5)
                                : info.cardio
                                  ? info.cardio.slice(0, 5)
                                  : "·";
                              const bg = both
                                ? "bg-gradient-to-r from-blue-400/20 to-orange-400/20 text-foreground"
                                : onlyStrength
                                  ? "bg-blue-400/15 text-blue-300"
                                  : onlyCardio
                                    ? "bg-orange-400/15 text-orange-300"
                                    : "bg-muted/40 text-muted-foreground/30";
                              const title = both
                                ? `${info.strength} + ${info.cardio}`
                                : (info.strength ?? info.cardio ?? "Rest");
                              return (
                                <div
                                  key={dayNum}
                                  className={`h-7 rounded px-1 flex items-center justify-center text-[10px] truncate ${bg}`}
                                  title={title}
                                >
                                  {label}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {r.days.length === 0 && (
                  <p className="text-xs text-muted-foreground/70 italic">
                    No days scheduled yet
                  </p>
                )}
              </Card>
            </Link>
          );
        })}

        <div className="pt-2">
          <CreateRoutineButton />
        </div>
      </div>
    </div>
  );
}
