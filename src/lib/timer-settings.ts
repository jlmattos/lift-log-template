"use client";

import { useSyncExternalStore } from "react";

/**
 * Device-local timer preferences (localStorage). Single-user app, so there is
 * no reason to round-trip these through the DB — and they must work offline
 * mid-set. Every read/write is try/caught: private mode, cleared site data or
 * a thumbnail render can make storage throw, and the page must still work.
 */

export type AlarmStyle = "chime" | "bell" | "buzzer";

export type TimerSettings = {
  /** Start the rest timer automatically after each logged set. */
  autoRest: boolean;
  /** Rest used when the exercise/template has none configured. */
  defaultRestSeconds: number;
  /** Alarm sound at zero. */
  sound: boolean;
  alarmStyle: AlarmStyle;
  /** 0–1 */
  volume: number;
  /** Soft ticks at 3-2-1. */
  countdownTicks: boolean;
  /** Vibrate at zero where the device supports it (Android). */
  vibrate: boolean;
  /** Keep the screen awake while the app is open (Screen Wake Lock API). */
  keepAwake: boolean;
};

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  autoRest: true,
  defaultRestSeconds: 90,
  sound: true,
  alarmStyle: "chime",
  volume: 0.8,
  countdownTicks: true,
  vibrate: true,
  keepAwake: true,
};

const KEY = "lift-log:timer-settings:v1";
const listeners = new Set<() => void>();
let cache: TimerSettings | null = null;

function read(): TimerSettings {
  if (cache) return cache;
  let stored: Partial<TimerSettings> = {};
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (raw) stored = JSON.parse(raw) as Partial<TimerSettings>;
  } catch {
    stored = {};
  }
  cache = { ...DEFAULT_TIMER_SETTINGS, ...stored };
  return cache;
}

export function getTimerSettings(): TimerSettings {
  return read();
}

export function updateTimerSettings(patch: Partial<TimerSettings>) {
  cache = { ...read(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable — keep the in-memory value for this page life */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** React hook: current settings, re-rendering on change (any tab). */
export function useTimerSettings(): TimerSettings {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_TIMER_SETTINGS);
}

/** Quick-pick rest durations offered in editors and the rest bar. */
export const REST_PRESETS = [45, 60, 75, 90, 120, 150, 180] as const;
/** Quick-pick timed-set durations. */
export const TIMED_PRESETS = [20, 30, 45, 60, 90, 120, 180, 300] as const;
