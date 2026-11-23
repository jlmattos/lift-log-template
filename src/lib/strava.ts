// Strava OAuth + API helpers. Server-side only — never import in client components.

import { supabase } from "@/db";

export const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
export const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
export const STRAVA_API_BASE = "https://www.strava.com/api/v3";

// Scope we ask for. activity:read_all = includes private activities.
export const STRAVA_SCOPE = "activity:read_all";

export function getStravaClientId(): string {
  const v = process.env.STRAVA_CLIENT_ID;
  if (!v) throw new Error("STRAVA_CLIENT_ID env var is not set");
  return v;
}

export function getStravaClientSecret(): string {
  const v = process.env.STRAVA_CLIENT_SECRET;
  if (!v) throw new Error("STRAVA_CLIENT_SECRET env var is not set");
  return v;
}

/** Builds the absolute callback URL based on current request host. */
export function getStravaRedirectUri(origin: string): string {
  return `${origin}/integrations/strava/callback`;
}

/** Builds the URL the user clicks to start the OAuth flow. */
export function buildAuthorizeUrl(origin: string): string {
  const params = new URLSearchParams({
    client_id: getStravaClientId(),
    redirect_uri: getStravaRedirectUri(origin),
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPE,
  });
  return `${STRAVA_AUTHORIZE_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  expires_in: number;
  athlete?: { id: number; firstname?: string; lastname?: string };
  scope?: string;
};

/** Exchange an authorization code for tokens (first-time connect). */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getStravaClientId(),
      client_secret: getStravaClientSecret(),
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Strava token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Refresh an expired access token. */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getStravaClientId(),
      client_secret: getStravaClientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Get a valid access token, refreshing if needed. Returns null if not connected.
 */
export async function getValidAccessToken(): Promise<{
  accessToken: string;
  athleteId: number;
  athleteName: string | null;
} | null> {
  const { data: row } = await supabase
    .from("strava_tokens")
    .select("*")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return null;

  const expiresMs = new Date(row.expires_at as string).getTime();
  const nowMs = Date.now();
  // Refresh 5 min before actual expiry
  if (expiresMs - nowMs < 5 * 60 * 1000) {
    const fresh = await refreshAccessToken(row.refresh_token as string);
    const expiresAt = new Date(fresh.expires_at * 1000).toISOString();
    await supabase
      .from("strava_tokens")
      .update({
        access_token: fresh.access_token,
        refresh_token: fresh.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return {
      accessToken: fresh.access_token,
      athleteId: row.athlete_id as number,
      athleteName: (row.athlete_name as string | null) ?? null,
    };
  }
  return {
    accessToken: row.access_token as string,
    athleteId: row.athlete_id as number,
    athleteName: (row.athlete_name as string | null) ?? null,
  };
}

/** Save tokens after a successful OAuth exchange. Replaces any existing row. */
export async function saveStravaTokens(t: TokenResponse): Promise<void> {
  // Clear existing rows (single-user app, only one connection at a time)
  await supabase.from("strava_tokens").delete().neq("athlete_id", -1);

  const athleteName = t.athlete
    ? [t.athlete.firstname, t.athlete.lastname].filter(Boolean).join(" ") || null
    : null;

  const { error } = await supabase.from("strava_tokens").insert({
    athlete_id: t.athlete?.id ?? 0,
    athlete_name: athleteName,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(t.expires_at * 1000).toISOString(),
    scope: t.scope ?? STRAVA_SCOPE,
  });
  if (error) throw new Error(`Failed to save Strava tokens: ${error.message}`);
}

export async function disconnectStrava(): Promise<void> {
  await supabase.from("strava_tokens").delete().neq("athlete_id", -1);
}

export async function getStravaConnectionInfo() {
  const { data: row } = await supabase
    .from("strava_tokens")
    .select("athlete_id, athlete_name, connected_at, expires_at, updated_at")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return row;
}
