"use client";

import type { AlarmStyle } from "@/lib/timer-settings";

/**
 * Synthesized timer sounds via the Web Audio API — no audio files to fetch,
 * works offline, and plays on iOS Safari as long as the AudioContext was
 * created/resumed inside a user gesture. Logging a set IS a tap, so call
 * `unlockAudio()` from that handler and later alarms are allowed to play.
 *
 * Honest limits: iOS mutes Web Audio when the ringer switch is on silent, and
 * nothing plays once the screen locks or the tab is backgrounded. The timers
 * are wall-clock anchored so they still fire the moment the page is visible.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call from a user gesture (tap) so later programmatic sounds are allowed. */
export function unlockAudio() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  // A silent one-sample buffer "primes" iOS so the first real sound isn't eaten.
  try {
    const buf = c.createBuffer(1, 1, c.sampleRate);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* ignore */
  }
}

type Tone = { freq: number; at: number; dur: number; type?: OscillatorType; gain?: number };

function schedule(tones: Tone[], volume: number) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const master = c.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume));
  master.connect(c.destination);
  const t0 = c.currentTime + 0.01;
  for (const t of tones) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = t.type ?? "sine";
    osc.frequency.value = t.freq;
    const start = t0 + t.at;
    const peak = t.gain ?? 1;
    // Short attack, exponential decay — reads as a "ping" rather than a buzz.
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + t.dur + 0.02);
  }
}

/** Soft tick for the 3-2-1 countdown. */
export function playTick(volume: number) {
  schedule([{ freq: 1000, at: 0, dur: 0.06, gain: 0.5 }], volume);
}

/**
 * Alarm at zero. `kind` picks the pattern so rest-over and set-over are
 * distinguishable without looking: rest = rising, set = falling.
 */
export function playAlarm(style: AlarmStyle, volume: number, kind: "rest" | "set" = "rest") {
  const up = kind === "rest";
  switch (style) {
    case "bell": {
      // Two struck bell notes (fundamental + partial) — long sustain.
      const n1 = up ? 660 : 880;
      const n2 = up ? 880 : 660;
      schedule(
        [
          { freq: n1, at: 0, dur: 0.9 },
          { freq: n1 * 2.4, at: 0, dur: 0.5, gain: 0.25 },
          { freq: n2, at: 0.45, dur: 1.1 },
          { freq: n2 * 2.4, at: 0.45, dur: 0.6, gain: 0.25 },
        ],
        volume
      );
      break;
    }
    case "buzzer": {
      // Three square-wave bursts — cuts through gym noise.
      const f = up ? 440 : 330;
      schedule(
        [
          { freq: f, at: 0, dur: 0.18, type: "square", gain: 0.6 },
          { freq: f, at: 0.25, dur: 0.18, type: "square", gain: 0.6 },
          { freq: f * (up ? 1.5 : 0.75), at: 0.5, dur: 0.35, type: "square", gain: 0.6 },
        ],
        volume
      );
      break;
    }
    case "chime":
    default: {
      // Three-note arpeggio.
      const seq = up ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25];
      schedule(
        seq.map((freq, i) => ({ freq, at: i * 0.16, dur: 0.45, type: "triangle" as OscillatorType })),
        volume
      );
      break;
    }
  }
}

/** Vibrate where supported (Android Chrome). iOS Safari ignores this. */
export function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}
