"use server";

import { supabase } from "@/db";
import { getValidAccessToken, STRAVA_API_BASE } from "@/lib/strava";
import { INTERVALS_API_BASE, INTERVALS_USER_AGENT, intervalsAuthHeader } from "@/lib/intervals";
import { todayLocal } from "@/lib/dates";
import { revalidatePath } from "next/cache";

// Strava activity types we care about. Strength-style activities are ignored
// to avoid double-counting against lift-log data.
const CARDIO_TYPE_MAP: Record<string, "ride" | "run" | "row" | "hike" | "walk" | "other"> = {
  Ride: "ride",
  VirtualRide: "ride",
  EBikeRide: "ride",
  Run: "run",
  TrailRun: "run",
  VirtualRun: "run",
  Rowing: "row",
  Hike: "hike",
  Walk: "walk",
  // Anything else falls through to ignored
};

// Default load estimate per minute when Strava doesn't give us suffer_score.
// Rough RPE-adjusted training-stress units (matches typical suffer_score scale).
const LOAD_PER_MINUTE: Record<string, number> = {
  ride: 0.75,
  run: 1.00,
  row: 0.95,
  hike: 0.40,
  walk: 0.30,
  other: 0.50,
};

type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date: string;          // ISO timestamp
  start_date_local: string;
  moving_time: number;         // seconds
  elapsed_time: number;
  distance: number;            // meters
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  suffer_score?: number | null;
};

function mapType(stravaType: string, sportType?: string): keyof typeof LOAD_PER_MINUTE | null {
  // sport_type is more specific (e.g. "MountainBikeRide") when present
  const t = CARDIO_TYPE_MAP[stravaType] ?? (sportType ? CARDIO_TYPE_MAP[sportType] : undefined);
  return t ?? null;
}

function estimateLoad(durationMin: number, type: keyof typeof LOAD_PER_MINUTE, sufferScore?: number | null): number {
  if (sufferScore != null && sufferScore > 0) return sufferScore;
  return Math.round(durationMin * (LOAD_PER_MINUTE[type] ?? 0.5));
}

/**
 * Fetch activities from Strava and upsert into cardio_sessions.
 * On first sync: pull last 180 days. On subsequent syncs: pull since the last
 * synced activity date.
 */
export async function syncStravaActivities(): Promise<{
  ok: boolean;
  added: number;
  updated: number;
  skipped: number;
  message?: string;
}> {
  const token = await getValidAccessToken();
  if (!token) return { ok: false, added: 0, updated: 0, skipped: 0, message: "Not connected" };

  // Find the most recent synced activity to do incremental fetches
  const { data: latest } = await supabase
    .from("cardio_sessions")
    .select("started_at")
    .eq("source", "strava")
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  let afterSecs: number;
  if (latest?.started_at) {
    afterSecs = Math.floor(new Date(latest.started_at as string).getTime() / 1000);
  } else {
    // First sync: last 180 days
    afterSecs = Math.floor((Date.now() - 180 * 24 * 60 * 60 * 1000) / 1000);
  }

  let page = 1;
  let added = 0, skipped = 0;
  // Supabase upsert doesn't report insert-vs-update, so this stays 0 (see below).
  const updated = 0;

  while (true) {
    const url = `${STRAVA_API_BASE}/athlete/activities?after=${afterSecs}&page=${page}&per_page=200`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, added, updated, skipped, message: `Strava ${res.status}: ${body.slice(0, 200)}` };
    }

    const activities = (await res.json()) as StravaActivity[];
    if (activities.length === 0) break;

    for (const a of activities) {
      const type = mapType(a.type, a.sport_type);
      if (!type) { skipped++; continue; }

      const durationMin = a.moving_time / 60;
      if (durationMin < 1) { skipped++; continue; } // ignore sub-1-minute blips

      const performedOn = a.start_date_local.slice(0, 10); // YYYY-MM-DD in local time
      const startedAt = a.start_date;
      const estimatedLoad = estimateLoad(durationMin, type, a.suffer_score);

      const row = {
        source: "strava" as const,
        strava_activity_id: a.id,
        performed_on: performedOn,
        started_at: startedAt,
        type,
        name: a.name,
        duration_min: Math.round(durationMin * 10) / 10,
        distance_m: a.distance ?? null,
        avg_hr: a.average_heartrate ?? null,
        max_hr: a.max_heartrate ?? null,
        avg_watts: a.average_watts ?? null,
        suffer_score: a.suffer_score ?? null,
        estimated_load: estimatedLoad,
      };

      // Upsert by strava_activity_id (UNIQUE constraint)
      const { error, count } = await supabase
        .from("cardio_sessions")
        .upsert(row, { onConflict: "strava_activity_id", count: "exact" });

      if (error) {
        return { ok: false, added, updated, skipped, message: `DB error: ${error.message}` };
      }
      // Supabase doesn't tell us insert vs update on upsert reliably without RPC,
      // so we estimate: count of 1 either way, ignore exact split.
      if ((count ?? 0) > 0) added++;
    }

    if (activities.length < 200) break;
    page++;
    if (page > 20) break; // 4000-activity safety cap
  }

  revalidatePath("/integrations/strava");
  revalidatePath("/cardio");
  revalidatePath("/wellness");
  revalidatePath("/recap");
  return { ok: true, added, updated, skipped };
}

// intervals.icu never returns activities from before the Garmin connection was
// made (2026-08-04), but if "Import All Garmin Data" is ever clicked, history
// would flood in — this floor guarantees pre-transition activities (already in
// the DB via Strava) are never re-imported.
const INTERVALS_SYNC_FLOOR = "2026-08-04";

type IntervalsActivity = {
  id: string | number;
  type?: string;
  name?: string;
  start_date_local?: string;
  start_date?: string;
  moving_time?: number; // seconds
  elapsed_time?: number;
  distance?: number; // meters
  average_heartrate?: number;
  icu_average_hr?: number;
  max_heartrate?: number;
  icu_max_hr?: number;
  average_watts?: number;
  icu_average_watts?: number;
  icu_training_load?: number | null;
};

/**
 * Pull activities from intervals.icu (fed directly by Garmin Connect) into
 * cardio_sessions. Mirrors the Strava sync: same type mapping, upsert keyed on
 * intervals_activity_id, incremental from the newest synced row. Activities
 * that already arrived via another source (Strava overlap during the
 * transition, or a manual log) are skipped by started-at proximity.
 */
export async function syncIntervalsActivities(): Promise<{
  ok: boolean;
  added: number;
  updated: number;
  skipped: number;
  message?: string;
}> {
  const auth = intervalsAuthHeader();
  if (!auth) return { ok: false, added: 0, updated: 0, skipped: 0, message: "intervals.icu not configured" };

  // Incremental window: from the newest intervals-synced activity (or floor).
  const { data: latest } = await supabase
    .from("cardio_sessions")
    .select("performed_on")
    .eq("source", "intervals")
    .order("performed_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  const oldest =
    latest?.performed_on && (latest.performed_on as string) > INTERVALS_SYNC_FLOOR
      ? (latest.performed_on as string)
      : INTERVALS_SYNC_FLOOR;

  const newest = new Date(new Date(todayLocal() + "T00:00:00").getTime() + 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const res = await fetch(
    `${INTERVALS_API_BASE}/athlete/0/activities?oldest=${oldest}&newest=${newest}`,
    { headers: { Authorization: auth, "User-Agent": INTERVALS_USER_AGENT }, cache: "no-store" }
  );
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, added: 0, updated: 0, skipped: 0, message: `intervals.icu ${res.status}: ${body.slice(0, 200)}` };
  }
  const activities = (await res.json()) as IntervalsActivity[];
  if (activities.length === 0) {
    revalidatePath("/cardio");
    return { ok: true, added: 0, updated: 0, skipped: 0 };
  }

  // Existing sessions from OTHER sources in the window, for overlap dedupe.
  const { data: existing } = await supabase
    .from("cardio_sessions")
    .select("source, started_at, performed_on, type")
    .gte("performed_on", INTERVALS_SYNC_FLOOR)
    .neq("source", "intervals");
  const existingOther = existing ?? [];

  let added = 0, skipped = 0;
  for (const a of activities) {
    const durationSec = a.moving_time ?? a.elapsed_time ?? 0;
    const durationMin = durationSec / 60;
    const type = mapType(a.type ?? "", undefined);
    if (!type || durationMin < 1) { skipped++; continue; }

    const startLocal = a.start_date_local ?? a.start_date ?? null;
    if (!startLocal) { skipped++; continue; }
    const performedOn = startLocal.slice(0, 10);
    const startedAt = a.start_date ?? a.start_date_local ?? null;

    // Cross-source dedupe: same activity may already exist via Strava (during
    // the overlap window) or as a manual log — match by type + start within
    // 45 minutes (or same-day when the other row lacks a timestamp).
    const startMs = startedAt ? new Date(startedAt).getTime() : null;
    const dupe = existingOther.some((e) => {
      if (e.type !== type) return false;
      if (startMs != null && e.started_at) {
        return Math.abs(new Date(e.started_at as string).getTime() - startMs) < 45 * 60 * 1000;
      }
      return e.performed_on === performedOn;
    });
    if (dupe) { skipped++; continue; }

    const avgHr = a.average_heartrate ?? a.icu_average_hr ?? null;
    const load = a.icu_training_load != null && a.icu_training_load > 0
      ? Math.round(a.icu_training_load)
      : estimateLoad(durationMin, type, null);

    const row = {
      source: "intervals" as const,
      intervals_activity_id: String(a.id),
      performed_on: performedOn,
      started_at: startedAt,
      type,
      name: a.name ?? null,
      duration_min: Math.round(durationMin * 10) / 10,
      distance_m: a.distance ?? null,
      avg_hr: avgHr,
      max_hr: a.max_heartrate ?? a.icu_max_hr ?? null,
      avg_watts: a.average_watts ?? a.icu_average_watts ?? null,
      suffer_score: null,
      estimated_load: load,
    };

    const { error, count } = await supabase
      .from("cardio_sessions")
      .upsert(row, { onConflict: "intervals_activity_id", count: "exact" });
    if (error) {
      if (/intervals_activity_id/i.test(error.message) && /could not find|does not exist/i.test(error.message)) {
        return { ok: false, added, updated: 0, skipped, message: "Run migration 0016 (drizzle/0016_intervals_sync.sql) to enable intervals.icu sync" };
      }
      return { ok: false, added, updated: 0, skipped, message: `DB error: ${error.message}` };
    }
    if ((count ?? 0) > 0) added++;
  }

  revalidatePath("/integrations/strava");
  revalidatePath("/cardio");
  revalidatePath("/wellness");
  revalidatePath("/recap");
  return { ok: true, added, updated: 0, skipped };
}

/**
 * Sync every configured cardio source (Strava while it lasts, intervals.icu
 * going forward). "Not configured/connected" sources are quietly skipped; the
 * result is ok when at least one configured source synced cleanly.
 */
export async function syncCardioSources(): Promise<{
  ok: boolean;
  added: number;
  updated: number;
  skipped: number;
  message?: string;
}> {
  const [strava, intervals] = await Promise.all([
    syncStravaActivities(),
    syncIntervalsActivities(),
  ]);

  const notConfigured = (m?: string) => !!m && /not con(nect|figur)ed/i.test(m);
  const results = [strava, intervals];
  const configured = results.filter((r) => r.ok || !notConfigured(r.message));
  const failures = configured.filter((r) => !r.ok);

  return {
    ok: configured.length > 0 && failures.length === 0,
    added: results.reduce((s, r) => s + r.added, 0),
    updated: 0,
    skipped: results.reduce((s, r) => s + r.skipped, 0),
    message: failures.length
      ? failures.map((f) => f.message).filter(Boolean).join(" · ")
      : configured.length === 0
        ? "No cardio source is connected"
        : undefined,
  };
}

export type CardioSession = {
  id: string;
  source: string;
  strava_activity_id: number | null;
  performed_on: string;
  started_at: string | null;
  type: string;
  name: string | null;
  duration_min: number;
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_watts: number | null;
  suffer_score: number | null;
  estimated_load: number | null;
  notes: string | null;
};

export async function listCardioSessions(daysBack: number = 30): Promise<CardioSession[]> {
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  const startStr = start.toISOString().split("T")[0];

  const { data } = await supabase
    .from("cardio_sessions")
    .select("*")
    .gte("performed_on", startStr)
    .order("performed_on", { ascending: false })
    .order("started_at", { ascending: false });
  return (data ?? []) as CardioSession[];
}
