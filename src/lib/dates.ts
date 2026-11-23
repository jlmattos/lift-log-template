/**
 * Day-identity helpers for the app's home timezone.
 *
 * Server code runs in UTC on Vercel, so `new Date().toISOString()` flips to
 * tomorrow at 8pm ET — a workout logged Monday evening would land on Tuesday
 * (this actually happened: a Zone 2 session logged 2026-07-27 8:14pm ET was
 * stamped 2026-07-28). Single-user app with one home timezone, so anything
 * that answers "what day is it for the user?" must go through here.
 *
 * Rolling analytics windows (e.g. "last 60 days" chart ranges) deliberately
 * still use UTC arithmetic — a few hours of boundary drift on a window edge
 * is immaterial, unlike the identity of "today".
 */
const HOME_TZ = process.env.HOME_TZ ?? "America/New_York";

/** Today's date (YYYY-MM-DD) in the home timezone. */
export function todayLocal(): string {
  // en-CA formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: HOME_TZ }).format(new Date());
}
