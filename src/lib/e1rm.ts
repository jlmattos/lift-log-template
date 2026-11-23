/**
 * Estimated 1-rep max via Epley formula.
 * e1RM = weight × (1 + reps / 30)
 *
 * Most accurate for 1–10 reps. Above 10, signal degrades — caller should
 * decide whether to show.
 */
export function calculateE1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/**
 * Round to nearest 0.5 for display.
 */
export function roundE1RM(value: number): number {
  return Math.round(value * 2) / 2;
}

type SetRow = {
  side: string;
  reps: number;
  load: number | string;
  set_index?: number;
  id?: string;
};

/**
 * Get the top (best) e1RM from a list of sets, optionally filtered by side.
 */
export function topE1RM(
  sets: SetRow[],
  side?: "left" | "right" | "both"
): { e1rm: number; reps: number; load: number } | null {
  const filtered = side ? sets.filter((s) => s.side === side) : sets;
  if (filtered.length === 0) return null;

  let best = { e1rm: 0, reps: 0, load: 0 };
  for (const s of filtered) {
    const load = Number(s.load);
    const e = calculateE1RM(load, s.reps);
    if (e > best.e1rm) {
      best = { e1rm: e, reps: s.reps, load };
    }
  }
  return best.e1rm > 0 ? best : null;
}
