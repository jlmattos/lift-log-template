import { ExportButtons } from "@/components/export-buttons";
import { BackHeader } from "@/components/back-header";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function ExportPage() {
  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-6">
      <BackHeader
        backHref="/progress"
        title="Export Data"
        subtitle="Download your data for backup or migration"
        className="mb-6"
      />

      <ExportButtons />

      {/* Health API — for an external "health chief of staff" to pull data on demand.
          NOTE: this page is public/unauthenticated, so we never render the real
          token here — only the URL shape and where to find the secret. */}
      <Card className="p-4 mt-3 border-blue-400/30 bg-blue-400/5">
        <h2 className="font-semibold mb-1">🔗 Health API</h2>
        <p className="text-xs text-muted-foreground mb-3">
          A read-only JSON endpoint so an external tool (e.g. a health assistant)
          can pull your full workout + health data automatically — no manual
          downloads. Returns workouts, sets, cardio, bodyweight, symptoms, goals,
          and profile. Excludes secrets (Strava tokens, AI chat history).
        </p>

        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
          Endpoint
        </p>
        <pre className="text-[11px] bg-muted/60 rounded p-2 mb-3 overflow-x-auto whitespace-pre-wrap break-all font-mono">
          GET /api/health?token=&lt;YOUR_TOKEN&gt;
        </pre>

        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Auth:</strong> send your secret token
            either as <code className="text-[11px]">?token=…</code> in the URL or an{" "}
            <code className="text-[11px]">Authorization: Bearer …</code> header.
          </p>
          <p>
            <strong className="text-foreground">Your token</strong> lives in the{" "}
            <code className="text-[11px]">HEALTH_API_TOKEN</code> environment variable
            (set in Vercel) — it is intentionally <em>not</em> shown on this page,
            which is public. Keep the full URL private; anyone with it can read your
            health data.
          </p>
          <p>
            To rotate it: change <code className="text-[11px]">HEALTH_API_TOKEN</code>{" "}
            in Vercel and redeploy. The old URL stops working immediately.
          </p>
        </div>
      </Card>
    </div>
  );
}
