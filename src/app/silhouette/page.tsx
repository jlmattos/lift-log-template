import { getMuscleVolumes } from "@/actions/silhouette";
import { getStrengthHeatmap } from "@/actions/strength-heatmap";
import { BodySilhouette } from "@/components/body-silhouette";
import { BackHeader } from "@/components/back-header";
import { WINDOW_OPTIONS, parseWindowKey, type WindowKey } from "@/lib/windows";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Mode = "volume" | "strength";

export default async function SilhouettePage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const mode: Mode = params.mode === "strength" ? "strength" : "volume";
  // Default window: 30d for volume (more meaningful at a glance), 90d for strength
  const windowKey: WindowKey = parseWindowKey(params.window, mode === "volume" ? "30d" : "90d");
  const days = WINDOW_OPTIONS.find((w) => w.key === windowKey)?.days ?? null;

  const [volumeData, strengthData] = await Promise.all([
    getMuscleVolumes(days),
    getStrengthHeatmap(windowKey),
  ]);

  const labelForMode =
    mode === "volume"
      ? `Volume per muscle · ${days ? `last ${days} days` : "all time"} · ${volumeData.totalVolume.toLocaleString()} lbs`
      : `Strength tier · ${days ? `last ${days} days (current capacity)` : "all-time peak"}`;

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader backHref="/more" title="Body Heatmap" subtitle={labelForMode} />

      {/* Mode toggle */}
      <div className="flex gap-1 bg-muted/40 rounded-md p-1">
        <Link
          href={`/silhouette?mode=volume&window=${windowKey}`}
          className={`flex-1 text-center text-sm py-2 rounded transition-colors ${
            mode === "volume"
              ? "bg-blue-400 text-background font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Volume
        </Link>
        <Link
          href={`/silhouette?mode=strength&window=${windowKey}`}
          className={`flex-1 text-center text-sm py-2 rounded transition-colors ${
            mode === "strength"
              ? "bg-blue-400 text-background font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Strength
        </Link>
      </div>

      {/* Window selector — same options for both modes */}
      <div className="flex gap-1 bg-muted/40 rounded-md p-1">
        {WINDOW_OPTIONS.map((opt) => (
          <Link
            key={opt.key}
            href={`/silhouette?mode=${mode}&window=${opt.key}`}
            className={`flex-1 text-center text-sm py-2.5 rounded transition-colors ${
              windowKey === opt.key
                ? "bg-blue-400 text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      <BodySilhouette
        mode={mode}
        byMuscle={volumeData.byMuscle}
        totalVolume={volumeData.totalVolume}
        windowDays={days ?? -1}
        strengthByMuscle={strengthData.byMuscle}
        strengthSetupNeeded={strengthData.needsSetup}
      />
    </div>
  );
}
