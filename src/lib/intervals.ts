/**
 * intervals.icu API client basics.
 *
 * Free personal API: HTTP Basic auth with the literal username "API_KEY" and
 * the key (Settings → Developer Settings) as the password. Limits are generous
 * for a single-user app (~5,000 req/day). A real User-Agent matters — their
 * Cloudflare config blocks generic client fingerprints.
 *
 * Activities reach intervals.icu directly from Garmin Connect (never via
 * Strava — Strava-sourced activities are excluded from their API by Strava's
 * terms).
 */
export const INTERVALS_API_BASE = "https://intervals.icu/api/v1";

export const INTERVALS_USER_AGENT = "lift-log/1.0 (personal single-user sync)";

/** Basic-auth header value, or null when INTERVALS_API_KEY isn't configured. */
export function intervalsAuthHeader(): string | null {
  const key = process.env.INTERVALS_API_KEY?.trim();
  if (!key) return null;
  return "Basic " + Buffer.from(`API_KEY:${key}`).toString("base64");
}
