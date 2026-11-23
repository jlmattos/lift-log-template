/**
 * Sequence-position engine for routines (cycle mode and the generic
 * next-workout sequence).
 *
 * The old approach — find the slot matching the MOST RECENT logged event and
 * advance past it — breaks when the same template fills several slots: with
 * Zone 2 on days 2, 4 and 8, finishing day 4's Zone 2 matched day 2 and sent
 * "up next" backwards to day 3.
 *
 * Instead, walk ALL routine-aligned events since the routine started, in
 * chronological order, tracking the expected position:
 * - event matches the currently-expected slot → on plan, advance by one;
 * - event uniquely matches some other slot → deliberate jump, re-anchor
 *   after that slot;
 * - event matches only duplicated slots elsewhere (an extra Zone 2 on an
 *   off-plan day) → bonus training, the plan doesn't move.
 */
export function nextSequenceIndex(slotKeys: string[], chronologicalEventKeys: string[]): number {
  if (slotKeys.length === 0) return 0;
  let pos = 0;
  for (const key of chronologicalEventKeys) {
    if (slotKeys[pos] === key) {
      pos = (pos + 1) % slotKeys.length;
      continue;
    }
    const matches: number[] = [];
    for (let i = 0; i < slotKeys.length; i++) if (slotKeys[i] === key) matches.push(i);
    if (matches.length === 1) pos = (matches[0] + 1) % slotKeys.length;
    // 0 matches (shouldn't happen — events are pre-filtered to sequence
    // members) or ambiguous duplicates: leave pos where it is.
  }
  return pos;
}
