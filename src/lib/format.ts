type SetRow = {
  set_index: number;
  side: string;
  reps: number;
  load: number | string;
  rpe?: number | string | null;
};

/**
 * Abbreviate a large number for headline stats: "1.2M" / "12.3k" / "847".
 * One decimal place for k and M.
 */
export function formatVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

/**
 * Abbreviate a number for tight spaces like chart axis ticks: "1M" / "12k" / "847".
 * No decimals on k/M so labels stay short.
 */
export function formatVolumeAxis(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return n.toString();
}

/**
 * Format a duration in seconds as "1h 23m" / "47m" / "<1m".
 * Returns null for invalid/zero inputs.
 */
export function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return "<1m";
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Compute workout duration in seconds from an array of sets (using created_at).
 * Returns 0 if fewer than 2 sets.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeWorkoutDuration(sets: any[]): number {
  if (!sets || sets.length < 2) return 0;
  const times = sets
    .map((s) => (s.created_at ? new Date(s.created_at).getTime() : 0))
    .filter((t) => t > 0)
    .sort((a, b) => a - b);
  if (times.length < 2) return 0;
  return Math.round((times[times.length - 1] - times[0]) / 1000);
}

/**
 * Parse and clamp an RPE value to 1-10. Empty/invalid → null.
 * Values above 10 get clamped to 10, below 1 become null.
 */
export function parseRpe(value: string): number | null {
  if (!value || !value.trim()) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  if (num < 1) return null;
  if (num > 10) return 10;
  return num;
}

/**
 * Summarize a session's sets into a compact one-line label.
 * Used for "Last: 3×8 @ 135" or unilateral "L: 8×25 / R: 8×25".
 */
export function summarizeSession(
  sets: SetRow[],
  isUnilateral: boolean
): string {
  if (sets.length === 0) return "";

  if (!isUnilateral) {
    // Group: count sets; show top weight + rep range
    const bothSets = sets.filter((s) => s.side === "both");
    if (bothSets.length === 0) return "";
    const loads = bothSets.map((s) => Number(s.load));
    const reps = bothSets.map((s) => s.reps);
    const topLoad = Math.max(...loads);
    const minReps = Math.min(...reps);
    const maxReps = Math.max(...reps);
    const repStr = minReps === maxReps ? `${minReps}` : `${minReps}-${maxReps}`;
    return `${bothSets.length} × ${repStr} @ ${topLoad}`;
  }

  // Unilateral: group by set_index, then show L/R top
  const lSets = sets.filter((s) => s.side === "left");
  const rSets = sets.filter((s) => s.side === "right");
  if (lSets.length === 0 && rSets.length === 0) return "";

  const lTop = lSets.length > 0 ? Math.max(...lSets.map((s) => Number(s.load))) : 0;
  const rTop = rSets.length > 0 ? Math.max(...rSets.map((s) => Number(s.load))) : 0;
  const lReps = lSets[0]?.reps ?? 0;
  const rReps = rSets[0]?.reps ?? 0;

  return `L ${lReps}×${lTop} / R ${rReps}×${rTop}`;
}

/**
 * Per-set-index compact cell lines for the recent-sessions comparison table
 * in SetLogger. Bilateral → one line per set ("8×50 @9"); unilateral → up to
 * two stacked lines ("L 8×25", "R 8×25 @8"). Keyed by set_index so sessions
 * with different set counts align row-by-row.
 */
export function sessionCellsByIndex(
  sets: SetRow[],
  isUnilateral: boolean
): Map<number, string[]> {
  const grouped = new Map<number, SetRow[]>();
  for (const s of sets) {
    if (!grouped.has(s.set_index)) grouped.set(s.set_index, []);
    grouped.get(s.set_index)!.push(s);
  }
  const out = new Map<number, string[]>();
  for (const [index, group] of grouped) {
    if (isUnilateral) {
      const lines: string[] = [];
      const l = group.find((s) => s.side === "left");
      const r = group.find((s) => s.side === "right");
      if (l) lines.push(`L ${l.reps}×${l.load}${l.rpe ? ` @${l.rpe}` : ""}`);
      if (r) lines.push(`R ${r.reps}×${r.load}${r.rpe ? ` @${r.rpe}` : ""}`);
      out.set(index, lines);
    } else {
      const s = group[0];
      out.set(index, [`${s.reps}×${s.load}${s.rpe ? ` @${s.rpe}` : ""}`]);
    }
  }
  return out;
}

/**
 * Render full session details as multi-line text (for the "Last Session" card in SetLogger).
 */
export function detailedSession(
  sets: SetRow[],
  isUnilateral: boolean
): { setIndex: number; display: string }[] {
  const grouped = new Map<number, SetRow[]>();
  for (const s of sets) {
    if (!grouped.has(s.set_index)) grouped.set(s.set_index, []);
    grouped.get(s.set_index)!.push(s);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, group]) => {
      if (isUnilateral) {
        const l = group.find((s) => s.side === "left");
        const r = group.find((s) => s.side === "right");
        const lStr = l ? `L ${l.reps}×${l.load}${l.rpe ? ` @${l.rpe}` : ""}` : "";
        const rStr = r ? `R ${r.reps}×${r.load}${r.rpe ? ` @${r.rpe}` : ""}` : "";
        return { setIndex: index, display: `${lStr}  ·  ${rStr}` };
      } else {
        const s = group[0];
        return {
          setIndex: index,
          display: `${s.reps} × ${s.load}${s.rpe ? ` @ RPE ${s.rpe}` : ""}`,
        };
      }
    });
}
