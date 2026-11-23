/**
 * Exercise grouping (supersets / tri-sets / giant sets).
 *
 * Groups are stored as a nullable `block` integer on template_exercises:
 * ADJACENT rows (by position) sharing the same block form one group. Labels
 * and kinds are derived here rather than stored, so the DB never needs
 * renumbering — reordering or removing a lift simply changes what's adjacent.
 *
 * Both the template editor and the Today page use this so they agree on
 * what a group is.
 */

export type GroupableRow = {
  position: number;
  block: number | null;
  restSeconds: number | null;
};

export type ExerciseGroup<T extends GroupableRow> = {
  /** Stable key for React. */
  key: string;
  /** "A", "B", … in order of appearance; null for a solo exercise. */
  label: string | null;
  /** Human kind: Superset / Tri-set / Giant set; null for a solo exercise. */
  kind: string | null;
  /** Rest between rounds (last member's rest_seconds), or null if unset. */
  restSeconds: number | null;
  members: T[];
};

export function groupKind(size: number): string | null {
  if (size < 2) return null;
  if (size === 2) return "Superset";
  if (size === 3) return "Tri-set";
  return "Giant set";
}

/**
 * Partition position-sorted rows into groups. A block number only groups rows
 * that are contiguous; the same number appearing again after a gap starts a
 * new group (the editor prevents that state, but tolerate it).
 */
export function deriveGroups<T extends GroupableRow>(rows: T[]): ExerciseGroup<T>[] {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const groups: ExerciseGroup<T>[] = [];
  let run: T[] = [];

  const flush = () => {
    if (run.length === 0) return;
    const grouped = run.length >= 2 && run[0].block != null;
    const last = run[run.length - 1];
    groups.push({
      key: grouped ? `block-${run[0].block}-${run[0].position}` : `solo-${run[0].position}`,
      label: null, // assigned below once we know the order of grouped runs
      kind: grouped ? groupKind(run.length) : null,
      restSeconds: last.restSeconds ?? null,
      members: run,
    });
    run = [];
  };

  for (const row of sorted) {
    if (run.length === 0) {
      run.push(row);
      continue;
    }
    const prev = run[run.length - 1];
    const sameBlock = row.block != null && prev.block != null && row.block === prev.block;
    if (sameBlock) {
      run.push(row);
    } else {
      flush();
      run.push(row);
    }
  }
  flush();

  // A block of 1 is just a solo exercise (e.g. the partner got removed).
  let letter = 0;
  for (const g of groups) {
    if (g.members.length >= 2 && g.members[0].block != null) {
      g.label = String.fromCharCode(65 + (letter++ % 26));
    } else {
      g.kind = null;
    }
  }
  return groups;
}

/** Smallest positive integer not used as a block in these rows. */
export function nextFreeBlock(rows: { block: number | null }[]): number {
  const used = new Set(rows.map((r) => r.block).filter((b): b is number => b != null));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/**
 * Format seconds as a compact label: 90 → "1:30", 60 → "1:00", 45 → "0:45".
 * Minutes-only values ≥ 10 min read as "10 min" to avoid long mm:ss strings.
 */
export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 10 && r === 0) return `${m} min`;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
