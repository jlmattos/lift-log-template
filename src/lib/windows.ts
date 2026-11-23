// Shared window definitions used across heatmaps, ratios, and strength views.

export type WindowKey = "7d" | "30d" | "90d" | "365d" | "all";

export const WINDOW_OPTIONS: { key: WindowKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
  { key: "365d", label: "1y", days: 365 },
  { key: "all", label: "All", days: null },
];

export function parseWindowKey(raw: string | undefined, fallback: WindowKey = "90d"): WindowKey {
  if (!raw) return fallback;
  const valid = WINDOW_OPTIONS.find((w) => w.key === raw);
  return valid ? (raw as WindowKey) : fallback;
}

export function windowStartDate(key: WindowKey): string | null {
  const def = WINDOW_OPTIONS.find((w) => w.key === key);
  if (!def || def.days == null) return null;
  const d = new Date();
  d.setDate(d.getDate() - def.days);
  return d.toISOString().split("T")[0];
}
