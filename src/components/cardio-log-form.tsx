"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  logCardioSession,
  findMatchingStravaSession,
  type CardioTemplate,
  type MetricDef,
} from "@/actions/cardio-templates";
import { syncCardioSources } from "@/actions/cardio";
import { MODALITIES, getModality, type ModalityKey } from "@/lib/cardio-modalities";

// Map a matched Strava session onto any tracked-metric keys it can fill, so the
// form pre-populates instead of making the user retype data Strava already has.
function stravaPrefill(
  match: NonNullable<MatchedSession>,
  metrics: MetricDef[],
): Record<string, unknown> {
  const fill: Record<string, unknown> = {};
  const set = (key: string, val: number | null) => {
    if (val == null) return;
    if (metrics.some((m) => m.key === key)) fill[key] = Math.round(val);
  };
  set("avg_hr", match.avg_hr);
  set("max_hr", match.max_hr);
  set("peak_hr", match.max_hr); // Strava's max ≈ our peak when no separate field
  set("avg_watts", match.avg_watts);
  if (match.distance_m != null && metrics.some((m) => m.key === "distance_mi")) {
    fill["distance_mi"] = Math.round((match.distance_m / 1609.34) * 100) / 100;
  }
  return fill;
}

type MatchedSession = {
  id: string;
  performed_on: string;
  duration_min: number;
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_watts: number | null;
  name: string | null;
} | null;

function fmtDistance(m: number | null): string {
  if (!m) return "—";
  const mi = m / 1609.34;
  return `${mi.toFixed(2)} mi`;
}

export function CardioLogForm({
  template,
  date,
  matchedStravaSession,
}: {
  template: CardioTemplate;
  date: string;
  matchedStravaSession: MatchedSession;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Two-axis templates let the user pick a modality (how) at log time. The
  // allowed list comes from the template; null/empty = legacy single-modality.
  const allowedModalities = (template.allowed_modalities ?? []).filter(
    (k): k is ModalityKey => MODALITIES.some((m) => m.key === k),
  );
  const isMultiModality = allowedModalities.length > 0;
  const [modalityKey, setModalityKey] = useState<ModalityKey | null>(null);
  const modality = getModality(modalityKey);

  // The modality contributes one output metric on top of the template's
  // protocol-common metrics.
  const outputMetric = modality?.outputMetric ?? null;
  const allMetrics: MetricDef[] = outputMetric
    ? [...template.tracked_metrics, outputMetric]
    : template.tracked_metrics;

  // Initialize each metric from its default
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const m of template.tracked_metrics) {
      if (m.default !== undefined) init[m.key] = m.default;
      else if (m.type === "boolean") init[m.key] = false;
      else init[m.key] = "";
    }
    return init;
  });

  function setVal(key: string, v: unknown) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  // Strava match: for two-axis templates it depends on the picked modality, so
  // we re-resolve it (in the modality's onClick) when the modality changes. For
  // legacy templates we use the server-provided match passed in as a prop.
  const [match, setMatch] = useState<MatchedSession>(matchedStravaSession);
  const [matchLoading, setMatchLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const matchedStrava = isMultiModality ? match : matchedStravaSession;

  // When a match resolves, autopopulate any tracked metric Strava can fill.
  function applyMatch(m: MatchedSession) {
    setMatch(m);
    if (m) setValues((prev) => ({ ...prev, ...stravaPrefill(m, allMetrics) }));
  }

  // Prefill once from the server-provided (legacy) match on first render.
  const [didPrefillProp, setDidPrefillProp] = useState(false);
  if (!isMultiModality && matchedStravaSession && !didPrefillProp) {
    setDidPrefillProp(true);
    setValues((prev) => ({ ...prev, ...stravaPrefill(matchedStravaSession, allMetrics) }));
  }

  function pickModality(key: ModalityKey) {
    setModalityKey(key);
    const mt = getModality(key)?.stravaMatchType ?? null;
    if (mt) {
      setMatchLoading(true);
      findMatchingStravaSession(template.id, date, mt)
        .then((m) => applyMatch(m))
        .finally(() => setMatchLoading(false));
    } else {
      setMatch(null);
    }
  }

  // "Sync now": pull from Strava immediately, then re-resolve the match so the
  // just-finished activity autopopulates without waiting for background sync.
  function syncNow() {
    const mt = isMultiModality
      ? getModality(modalityKey)?.stravaMatchType ?? null
      : template.strava_match_type;
    setSyncing(true);
    setSyncMsg(null);
    startTransition(async () => {
      try {
        const res = await syncCardioSources();
        if (!res.ok) {
          setSyncMsg(res.message ?? "Sync failed");
        } else {
          const m = await findMatchingStravaSession(template.id, date, mt ?? undefined);
          applyMatch(m);
          setSyncMsg(m ? "✓ Synced — activity data filled in" : "Synced — no matching activity found yet");
        }
      } catch (e) {
        setSyncMsg(e instanceof Error ? e.message : "Sync failed");
      } finally {
        setSyncing(false);
      }
    });
  }

  // For manual entries (no Strava match), let user enter duration
  const [fallbackDuration, setFallbackDuration] = useState<string>("");

  function submit() {
    setError(null);

    if (isMultiModality && !modality) {
      setError("Pick a modality (how you did it) first.");
      return;
    }

    // Required metric check
    for (const m of allMetrics) {
      if (m.required && (values[m.key] === "" || values[m.key] == null)) {
        setError(`Required: ${m.label}`);
        return;
      }
    }

    // Coerce number fields
    const cleaned: Record<string, unknown> = {};
    for (const m of allMetrics) {
      const v = values[m.key];
      if (v === "" || v == null) continue;
      if (m.type === "number") cleaned[m.key] = Number(v);
      else cleaned[m.key] = v;
    }

    startTransition(async () => {
      try {
        await logCardioSession({
          templateId: template.id,
          date,
          manualMetrics: cleaned,
          matchedStravaSessionId: matchedStrava?.id ?? null,
          fallbackDurationMin: matchedStrava ? undefined : Number(fallbackDuration) || 0,
          protocol: template.protocol ?? null,
          modality: modality?.key ?? null,
          modalitySessionType: modality?.sessionType ?? null,
        });
        router.push("/cardio?logged=1");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Modality picker (two-axis templates only) */}
      {isMultiModality && (
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            How did you do it?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {allowedModalities.map((key) => {
              const m = getModality(key)!;
              const active = modalityKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickModality(key)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-md border text-sm transition-colors ${
                    active
                      ? "bg-blue-400 text-background border-blue-400 font-medium"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-lg leading-none">{m.emoji}</span>
                  {m.label}
                </button>
              );
            })}
          </div>
          {matchLoading && (
            <p className="text-[11px] text-muted-foreground mt-2">Checking Strava…</p>
          )}
        </Card>
      )}

      {/* Until a modality is picked (multi-modality), hold the rest of the form. */}
      {isMultiModality && !modality ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Pick a modality above to log this session.
        </p>
      ) : (
      <>
      {/* Strava match card */}
      {matchedStrava ? (
        <Card className="p-3 bg-emerald-400/5 border-emerald-400/30">
          <p className="text-[10px] uppercase tracking-wider text-emerald-300 font-semibold mb-1">
            ✓ Strava match found
          </p>
          <p className="text-sm font-medium">{matchedStrava.name ?? "Activity"}</p>
          <div className="text-[11px] text-muted-foreground tabular-nums mt-1 space-x-2">
            <span>{Math.round(matchedStrava.duration_min)} min</span>
            <span>·</span>
            <span>{fmtDistance(matchedStrava.distance_m)}</span>
            {matchedStrava.avg_hr && (<><span>·</span><span>avg HR {Math.round(matchedStrava.avg_hr)}</span></>)}
            {matchedStrava.max_hr && (<><span>·</span><span>max HR {Math.round(matchedStrava.max_hr)}</span></>)}
            {matchedStrava.avg_watts && (<><span>·</span><span>{Math.round(matchedStrava.avg_watts)}W</span></>)}
          </div>
          <p className="text-[10px] text-emerald-300/70 mt-2">
            Auto-filled below where Strava had the data. Fill in the gaps.
          </p>
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            className="text-[11px] text-emerald-300/80 hover:text-emerald-200 mt-1.5 transition-colors"
          >
            {syncing ? "Syncing…" : "↻ Re-sync Strava"}
          </button>
          {syncMsg && <p className="text-[11px] text-muted-foreground mt-1">{syncMsg}</p>}
        </Card>
      ) : (isMultiModality ? modality?.stravaMatchType : template.strava_match_type) ? (
        <Card className="p-3 bg-amber-400/5 border-amber-400/30">
          <p className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold mb-1">
            No Strava match yet
          </p>
          <p className="text-xs">
            Just finished? Pull from Strava now so it autofills — or enter total duration to log manually.
          </p>
          <Button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            variant="outline"
            className="w-full mt-2 h-9 text-sm"
          >
            {syncing ? "Syncing…" : "↻ Sync Strava now"}
          </Button>
          {syncMsg && <p className="text-[11px] text-muted-foreground mt-1.5">{syncMsg}</p>}
          <div className="mt-3">
            <Label htmlFor="fb-dur" className="text-xs">Duration (min)</Label>
            <Input
              id="fb-dur"
              type="number"
              inputMode="numeric"
              value={fallbackDuration}
              onChange={(e) => setFallbackDuration(e.target.value)}
              className="mt-1"
              placeholder="e.g. 45"
            />
          </div>
        </Card>
      ) : null}

      {/* Metric inputs */}
      <Card className="p-4 space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Metrics
        </p>
        {allMetrics.map((m) => (
          <MetricInput key={m.key} metric={m} value={values[m.key]} onChange={(v) => setVal(m.key, v)} />
        ))}
      </Card>

      {error && (
        <Card className="p-3 bg-red-400/10 border-red-400/30">
          <p className="text-xs text-red-300">{error}</p>
        </Card>
      )}

      <Button onClick={submit} disabled={pending} className="w-full h-12">
        {pending ? "Saving…" : "Save session"}
      </Button>
      </>
      )}
    </div>
  );
}

function MetricInput({
  metric,
  value,
  onChange,
}: {
  metric: MetricDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = metric.required ? `${metric.label} *` : metric.label;

  if (metric.type === "boolean") {
    return (
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`w-12 h-6 rounded-full transition-colors ${value ? "bg-amber-400" : "bg-muted"}`}
          aria-pressed={!!value}
        >
          <span className={`block w-5 h-5 rounded-full bg-background transition-transform ${value ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
      </div>
    );
  }

  if (metric.type === "enum" && metric.options) {
    return (
      <div>
        <Label className="text-sm">{label}</Label>
        <div className="mt-1 space-y-1">
          {metric.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`w-full text-left text-sm px-3 py-2 rounded border transition-colors ${
                value === opt
                  ? "bg-blue-400 text-background border-blue-400 font-medium"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (metric.type === "text") {
    return (
      <div>
        <Label className="text-sm">{label}</Label>
        <textarea
          className="w-full mt-1 p-2 bg-background border border-border rounded-md text-sm min-h-[60px]"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Anything worth remembering"
        />
      </div>
    );
  }

  // number
  return (
    <div>
      <Label className="text-sm">
        {label}
        {metric.unit && <span className="text-muted-foreground text-xs ml-1">({metric.unit})</span>}
        {metric.range && (
          <span className="text-muted-foreground text-[10px] ml-2">{metric.range[0]}–{metric.range[1]}</span>
        )}
      </Label>
      <Input
        type="number"
        inputMode="decimal"
        className="mt-1"
        value={(value as string | number) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        min={metric.range?.[0]}
        max={metric.range?.[1]}
      />
    </div>
  );
}
