// Display metadata for the "protocol" axis of cardio (the "what" — VO2, Zone 2…),
// plus a shared formatter for "protocol · modality" labels used across the
// cardio list, templates page, and daily briefing.

import { getModality } from "@/lib/cardio-modalities";

export type ProtocolMeta = { label: string; emoji: string; color: string };

export const PROTOCOL_META: Record<string, ProtocolMeta> = {
  vo2:           { label: "VO2 Max",       emoji: "🔥", color: "text-red-300" },
  zone_2:        { label: "Zone 2",        emoji: "🫀", color: "text-blue-300" },
  sprints:       { label: "Sprints",       emoji: "⚡", color: "text-orange-300" },
  ruck:          { label: "Ruck",          emoji: "🎒", color: "text-amber-300" },
  shred_shed:    { label: "Shred Shed",    emoji: "🪨", color: "text-orange-300" },
  z2_hiit:       { label: "Zone 2 + HIIT", emoji: "🫀⚡", color: "text-violet-300" },
  // legacy protocol-ish `type` values, for back-compat display:
  vo2_bike:      { label: "VO2 — Bike",    emoji: "🔥", color: "text-red-300" },
  vo2_rower:     { label: "VO2 — Rower",   emoji: "🔥", color: "text-red-300" },
  rower_sprints: { label: "Rower sprints", emoji: "⚡", color: "text-orange-300" },
};

export function protocolMeta(key: string | null | undefined): ProtocolMeta | null {
  if (!key) return null;
  return PROTOCOL_META[key] ?? null;
}

/**
 * Human label for a session combining its protocol (what) and modality (how),
 * e.g. "VO2 Max · 🚴 Bike". Falls back gracefully when either axis is absent
 * (older sessions logged before the two-axis model).
 */
export function protocolModalityLabel(
  protocol: string | null | undefined,
  modality: string | null | undefined,
): string | null {
  const p = protocolMeta(protocol);
  const m = getModality(modality);
  if (p && m) return `${p.label} · ${m.emoji} ${m.label}`;
  if (p) return p.label;
  if (m) return `${m.emoji} ${m.label}`;
  return null;
}
