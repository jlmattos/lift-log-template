import Link from "next/link";
import { Card } from "@/components/ui/card";
import { BackHeader } from "@/components/back-header";
import { listCardioTemplates, type MetricDef } from "@/actions/cardio-templates";
import { PrescriptionMarkdown } from "@/components/prescription-markdown";
import { getModality } from "@/lib/cardio-modalities";

export const dynamic = "force-dynamic";

const TYPE_META: Record<string, { label: string; emoji: string; bg: string; text: string }> = {
  // Two-axis protocols (post-conversion)
  vo2:           { label: "VO2 Max",     emoji: "🔥", bg: "bg-red-400/10 border-red-400/30",        text: "text-red-300" },
  zone_2:        { label: "Zone 2",      emoji: "🫀", bg: "bg-blue-400/10 border-blue-400/30",      text: "text-blue-300" },
  sprints:       { label: "Sprints",     emoji: "⚡", bg: "bg-orange-400/10 border-orange-400/30",  text: "text-orange-300" },
  shred_shed:    { label: "Shred Shed",  emoji: "🪨", bg: "bg-orange-400/10 border-orange-400/30",  text: "text-orange-300" },
  z2_hiit:       { label: "Zone 2 + HIIT", emoji: "🫀⚡", bg: "bg-violet-400/10 border-violet-400/30", text: "text-violet-300" },
  // Legacy keys (kept for back-compat until any remaining old rows are gone)
  ruck:          { label: "Ruck",        emoji: "🎒", bg: "bg-amber-400/10 border-amber-400/30",    text: "text-amber-300" },
  vo2_bike:      { label: "VO2 — Bike",  emoji: "🚴", bg: "bg-red-400/10 border-red-400/30",        text: "text-red-300" },
  vo2_rower:     { label: "VO2 — Rower", emoji: "🚣", bg: "bg-red-400/10 border-red-400/30",        text: "text-red-300" },
  rower_sprints: { label: "Rower sprints", emoji: "🚣", bg: "bg-orange-400/10 border-orange-400/30", text: "text-orange-300" },
};

function metricSummary(m: MetricDef): string {
  if (m.type === "boolean") return `${m.label} (Y/N)`;
  if (m.type === "enum") return `${m.label} (${m.options?.length ?? 0} options)`;
  if (m.type === "number" && m.unit) return `${m.label} (${m.unit})`;
  return m.label;
}

export default async function CardioTemplatesPage() {
  const templates = await listCardioTemplates();

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader
        backHref="/more"
        title="Cardio Templates"
        subtitle="Prescribed sessions with their tracked metrics · Strava auto-fills what it can"
      />

      {templates.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">No cardio templates yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const meta = TYPE_META[t.type] ?? { label: t.type, emoji: "🏃", bg: "bg-muted", text: "text-muted-foreground" };
            return (
              <Card key={t.id} className={`p-4 border ${meta.bg}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className={`text-[10px] uppercase tracking-wider font-semibold ${meta.text}`}>
                      {meta.emoji} {meta.label}
                    </p>
                    <h2 className="font-semibold text-base mt-0.5">{t.name}</h2>
                    {/* Two-axis templates: show the modalities you can pick at log time */}
                    {t.allowed_modalities && t.allowed_modalities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {t.allowed_modalities.map((k) => {
                          const m = getModality(k);
                          if (!m) return null;
                          return (
                            <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {m.emoji} {m.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/cardio/log/${t.id}`}
                    className="text-xs bg-blue-400 text-background font-medium px-3 py-1.5 rounded shrink-0"
                  >
                    Log →
                  </Link>
                </div>

                {t.prescription_notes && (
                  <div className="mt-2 border-l-2 border-border pl-2">
                    <PrescriptionMarkdown content={t.prescription_notes} />
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-border/40">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                    Tracks per session
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {t.tracked_metrics.map((m) => (
                      <span
                        key={m.key}
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          m.required ? "bg-blue-400/15 text-blue-300" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {metricSummary(m)}{m.required ? " *" : ""}
                      </span>
                    ))}
                  </div>
                </div>

                {t.strava_match_type && (
                  <p className="text-[10px] text-muted-foreground/70 mt-2">
                    Auto-matches Strava type: <span className="font-mono">{t.strava_match_type}</span>
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-3 text-[11px] text-muted-foreground">
        Cardio templates aren&apos;t yet editable from the routine editor — they live only here for now.
        Templates are linked to your active routine&apos;s cardio days (Tue ruck, Wed VO2, Sat Shred Shed,
        Fri rower finisher) and surface as &ldquo;Log session →&rdquo; cards in the Today briefing.
      </Card>
    </div>
  );
}
