import { headers } from "next/headers";
import { Card } from "@/components/ui/card";
import { BackHeader } from "@/components/back-header";
import { buildAuthorizeUrl, getStravaConnectionInfo } from "@/lib/strava";
import { disconnectStravaAction } from "@/app/integrations/strava/actions";

export const dynamic = "force-dynamic";

export default async function StravaIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const params = await searchParams;
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";
  const authUrl = origin ? buildAuthorizeUrl(origin) : "";

  const info = await getStravaConnectionInfo();

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader
        backHref="/more"
        title="Cardio Sync"
        subtitle="Sync cardio activities for Training Stress Balance"
      />

      {/* intervals.icu — the Strava replacement (Garmin → intervals.icu → here) */}
      <Card className={`p-4 ${process.env.INTERVALS_API_KEY ? "border-emerald-400/40 bg-emerald-400/5" : "border-dashed"}`}>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          intervals.icu
        </p>
        {process.env.INTERVALS_API_KEY ? (
          <>
            <p className="text-sm mt-1 text-emerald-300">✓ Configured</p>
            <p className="text-xs text-muted-foreground mt-1">
              Activities flow Garmin → intervals.icu → here automatically on each
              sync (the Sync button on the cardio pages pulls all sources). This
              replaces the Strava API, which requires a subscription from Aug 2026.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm mt-1 text-muted-foreground">Not configured</p>
            <p className="text-xs text-muted-foreground mt-1">
              Set INTERVALS_API_KEY (from intervals.icu → Settings → Developer
              Settings) in the environment to sync Garmin activities without the
              paid Strava API.
            </p>
          </>
        )}
      </Card>

      {params.connected === "1" && (
        <Card className="p-3 bg-emerald-400/10 border-emerald-400/30">
          <p className="text-sm text-emerald-300">✓ Strava connected.</p>
        </Card>
      )}

      {params.error && (
        <Card className="p-3 bg-red-400/10 border-red-400/30">
          <p className="text-sm text-red-300">Connection failed: {params.error}</p>
        </Card>
      )}

      {info ? (
        <Card className="p-4 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Connected as
            </p>
            <p className="text-lg font-semibold mt-0.5">
              {info.athlete_name ?? `Athlete ${info.athlete_id}`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Since {new Date(info.connected_at as string).toLocaleDateString()}
            </p>
          </div>
          <form action={disconnectStravaAction}>
            <button
              type="submit"
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Disconnect
            </button>
          </form>
        </Card>
      ) : (
        <Card className="p-4 space-y-3">
          <p className="text-sm">
            Connect your Strava account to pull in cardio activities (cycling, rowing,
            running, hiking). Used for Training Stress Balance — fitness vs fatigue tracking.
          </p>
          <p className="text-xs text-muted-foreground">
            Only your activity data is read. We never post on your behalf.
          </p>
          <a
            href={authUrl}
            className="inline-flex items-center gap-2 bg-[#fc4c02] hover:bg-[#e34302] text-white font-semibold px-4 py-2.5 rounded transition-colors"
          >
            Connect with Strava
          </a>
        </Card>
      )}

      <Card className="p-4 text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground">What syncs to Strava automatically:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Peloton rides → Profile → Settings → Social → Connect Strava</li>
          <li>Garmin watch (running, hiking) → Garmin Connect → Connected Apps</li>
          <li>SmartRow (water rower) → enable in the SmartRow app</li>
        </ul>
        <p className="pt-1">
          Strength training is ignored to avoid double-counting with your lift-log data.
        </p>
      </Card>
    </div>
  );
}
