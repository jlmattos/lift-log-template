import { listInjuryAreas } from "@/actions/symptoms";
import { getSymptomCorrelation } from "@/actions/correlation";
import { getWellnessTSBInsight } from "@/actions/wellness-tsb";
import { WellnessView } from "@/components/wellness-view";
import { WellnessTSBCard } from "@/components/wellness-tsb-card";
import { BackHeader } from "@/components/back-header";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function WellnessPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const params = await searchParams;
  const validWindows = [30, 60, 90, 180];
  const req = parseInt(params.window ?? "90");
  const windowDays = validWindows.includes(req) ? req : 90;

  const areas = await listInjuryAreas();

  const [correlations, tsbInsight] = await Promise.all([
    Promise.all(areas.map((a) => getSymptomCorrelation(a.id, windowDays))),
    getWellnessTSBInsight(windowDays),
  ]);

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
      <BackHeader
        backHref="/progress"
        title="Wellness"
        subtitle={`Symptom × training correlation · ${areas.length} area${areas.length !== 1 ? "s" : ""} · last ${windowDays} days`}
        className="mb-4"
      />

      {/* Window selector */}
      <div className="flex gap-1 bg-muted/40 rounded-md p-1 mb-4">
        {validWindows.map((w) => (
          <Link
            key={w}
            href={`/wellness?window=${w}`}
            className={`flex-1 text-center text-sm py-2 rounded transition-colors ${
              windowDays === w
                ? "bg-blue-400 text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {w}d
          </Link>
        ))}
      </div>

      {/* Fatigue × symptoms insight */}
      <div className="mb-4">
        <WellnessTSBCard insight={tsbInsight} />
      </div>

      <WellnessView areas={areas} correlations={correlations} />
    </div>
  );
}
