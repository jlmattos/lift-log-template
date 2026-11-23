"use client";

import { useSyncExternalStore } from "react";
import type { RestTimerState } from "@/components/rest-timer-bar";

/**
 * The active rest timer, persisted to localStorage so a page reload (or the
 * PWA being relaunched mid-rest) restores the countdown. An external store
 * rather than component state: it can be read synchronously on the client
 * with no hydration mismatch (server snapshot is always null) and no
 * set-state-in-effect.
 */

type Stored = RestTimerState & { workoutId: string };

const KEY = "lift-log:rest-timer:v1";
const listeners = new Set<() => void>();
let cache: Stored | null | undefined; // undefined = not read yet

function read(): Stored | null {
  if (cache !== undefined) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    // Discard timers that ended more than a minute ago (stale from yesterday).
    cache = parsed && parsed.endsAt > Date.now() - 60_000 ? parsed : null;
  } catch {
    cache = null;
  }
  return cache;
}

function write(next: Stored | null) {
  cache = next;
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — in-memory only */
  }
  listeners.forEach((l) => l());
}

export function startRestTimer(workoutId: string, seconds: number, label: string) {
  const now = Date.now();
  write({ workoutId, startedAt: now, endsAt: now + seconds * 1000, totalSeconds: seconds, label });
}

export function adjustRestTimer(deltaSeconds: number) {
  const cur = read();
  if (!cur) return;
  // Adjusting a finished timer restarts it from "now" (+15s after zero = 15s more).
  const base = Math.max(cur.endsAt, Date.now());
  write({
    ...cur,
    endsAt: base + deltaSeconds * 1000,
    totalSeconds: Math.max(5, cur.totalSeconds + deltaSeconds),
  });
}

export function clearRestTimer() {
  write(null);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** The active rest timer for this workout, or null. */
export function useRestTimer(workoutId: string | undefined): RestTimerState | null {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  if (!stored || !workoutId || stored.workoutId !== workoutId) return null;
  return stored;
}
