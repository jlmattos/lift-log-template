// Available plates in lbs (largest to smallest)
export const AVAILABLE_PLATES = [45, 25, 10, 5, 2.5, 1, 0.75, 0.5, 0.25];

// Default bar weight in lbs
export const DEFAULT_BAR_WEIGHT = 45;

// The bar an exercise is loaded on, for plate math and badges.
export type BarInfo = { name: string; weight: number };

/**
 * Which bar (if any) an exercise uses. Assigned equipment wins; otherwise the
 * "barbell" equipment type implies the standard 45 lb bar; anything else has
 * no bar and gets no plate math. PostgREST returns numeric as string — Number()
 * normalizes.
 */
export function resolveBar(exercise: {
  equipment_type?: string | null;
  equipment?: { name: string; bar_weight: number | string } | null;
}): BarInfo | null {
  if (exercise.equipment) {
    return {
      name: exercise.equipment.name,
      weight: Number(exercise.equipment.bar_weight),
    };
  }
  if (exercise.equipment_type === "barbell") {
    return { name: "Barbell", weight: DEFAULT_BAR_WEIGHT };
  }
  return null;
}

export type PlateBreakdown = {
  perSide: { plate: number; count: number }[];
  totalLoaded: number;
  remainder: number; // 0 if exact, positive if can't reach target
  valid: boolean;
};

/**
 * Calculate plate breakdown for a barbell.
 * Greedy: use largest plate as many times as possible, then next, etc.
 *
 * Returns plates needed PER SIDE.
 */
export function calculatePlates(
  targetWeight: number,
  barWeight: number = DEFAULT_BAR_WEIGHT,
  availablePlates: number[] = AVAILABLE_PLATES
): PlateBreakdown {
  // Can't load less than bar
  if (targetWeight < barWeight) {
    return {
      perSide: [],
      totalLoaded: barWeight,
      remainder: targetWeight - barWeight, // negative
      valid: false,
    };
  }

  // Exactly bar weight
  if (targetWeight === barWeight) {
    return {
      perSide: [],
      totalLoaded: barWeight,
      remainder: 0,
      valid: true,
    };
  }

  const plateWeightPerSide = (targetWeight - barWeight) / 2;
  let remaining = plateWeightPerSide;
  const perSide: { plate: number; count: number }[] = [];

  for (const plate of availablePlates) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / plate + 1e-9); // tiny epsilon for fp
    if (count > 0) {
      perSide.push({ plate, count });
      remaining = Math.round((remaining - plate * count) * 1000) / 1000;
    }
  }

  const loadedPerSide = perSide.reduce((sum, p) => sum + p.plate * p.count, 0);
  const totalLoaded = barWeight + loadedPerSide * 2;

  return {
    perSide,
    totalLoaded,
    remainder: Math.round((targetWeight - totalLoaded) * 1000) / 1000,
    valid: remaining < 0.01,
  };
}

/**
 * Format breakdown as a compact string: "45, 25, 5"
 */
export function formatBreakdown(breakdown: PlateBreakdown): string {
  if (breakdown.perSide.length === 0) {
    if (breakdown.valid) return "Bar only";
    return "Below bar";
  }

  const parts: string[] = [];
  for (const { plate, count } of breakdown.perSide) {
    for (let i = 0; i < count; i++) {
      parts.push(String(plate));
    }
  }
  return parts.join(", ");
}
