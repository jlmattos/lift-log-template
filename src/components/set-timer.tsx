"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatSeconds } from "@/lib/groups";
import { TIMED_PRESETS, useTimerSettings } from "@/lib/timer-settings";
import { playAlarm, playTick, unlockAudio, vibrate } from "@/lib/timer-audio";

/**
 * Set timer for time-based work (holds, carries, rower finisher) or as a
 * plain stopwatch. Lives inside the SetLogger of the exercise it times.
 *
 * Countdown mode counts to zero from `defaultSeconds` (template timed_seconds,
 * else the last preset used) and alarms; stopwatch mode counts up until
 * stopped. Both are anchored to wall-clock timestamps so they stay honest
 * through background throttling.
 */
export function SetTimer({
  defaultSeconds,
  autoOpen,
}: {
  /** From the template's timed_seconds (null = pick a preset). */
  defaultSeconds: number | null;
  /** Timed exercises show the timer expanded by default. */
  autoOpen: boolean;
}) {
  const settings = useTimerSettings();
  const [open, setOpen] = useState(autoOpen);
  const [mode, setMode] = useState<"countdown" | "stopwatch">("countdown");
  const [target, setTarget] = useState<number>(defaultSeconds ?? 60);
  // Running state: `startedAt` set while running; `accumulated` holds elapsed
  // ms from earlier run segments (pause/resume).
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [accumulated, setAccumulated] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const alarmed = useRef(false);
  const lastTick = useRef<number | null>(null);

  const running = startedAt != null;
  const elapsedMs = accumulated + (running ? now - startedAt : 0);
  const elapsed = Math.floor(elapsedMs / 1000);
  const remainingMs = target * 1000 - elapsedMs;
  const remaining = Math.ceil(remainingMs / 1000);
  const done = mode === "countdown" && remainingMs <= 0;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    const onVisible = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running]);

  // Ticks at 3-2-1 in countdown mode.
  useEffect(() => {
    if (!running || mode !== "countdown" || done) return;
    if (!settings.sound || !settings.countdownTicks) return;
    if (remaining <= 3 && remaining >= 1 && lastTick.current !== remaining) {
      lastTick.current = remaining;
      playTick(settings.volume);
    }
  }, [remaining, running, mode, done, settings.sound, settings.countdownTicks, settings.volume]);

  // Alarm at zero (falling pattern = "set over"), then stop the clock.
  useEffect(() => {
    if (!done || alarmed.current) return;
    alarmed.current = true;
    if (settings.sound) playAlarm(settings.alarmStyle, settings.volume, "set");
    if (settings.vibrate) vibrate([400, 150, 400]);
    setAccumulated(target * 1000);
    setStartedAt(null);
  }, [done, settings.sound, settings.alarmStyle, settings.volume, settings.vibrate, target]);

  function start() {
    unlockAudio();
    alarmed.current = false;
    lastTick.current = null;
    if (done) setAccumulated(0);
    setNow(Date.now());
    setStartedAt(Date.now());
  }
  function pause() {
    if (startedAt == null) return;
    setAccumulated((a) => a + (Date.now() - startedAt));
    setStartedAt(null);
  }
  function reset() {
    alarmed.current = false;
    lastTick.current = null;
    setStartedAt(null);
    setAccumulated(0);
  }
  function pick(seconds: number) {
    setMode("countdown");
    setTarget(seconds);
    reset();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-9 rounded-md text-xs font-medium border border-dashed border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        ⏱ Set timer / stopwatch
      </button>
    );
  }

  const display =
    mode === "countdown" ? (done ? "0:00" : formatSeconds(Math.max(0, remaining))) : formatSeconds(elapsed);

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 transition-colors ${
        done
          ? "border-emerald-400/50 bg-emerald-400/10"
          : running
            ? "border-blue-400/40 bg-blue-400/5"
            : "border-border/60 bg-muted/20"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 text-[11px]">
          <button
            type="button"
            onClick={() => { setMode("countdown"); reset(); }}
            className={`px-2 py-0.5 rounded ${mode === "countdown" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Countdown
          </button>
          <button
            type="button"
            onClick={() => { setMode("stopwatch"); reset(); }}
            className={`px-2 py-0.5 rounded ${mode === "stopwatch" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            Stopwatch
          </button>
        </div>
        <button
          type="button"
          onClick={() => { reset(); setOpen(false); }}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label="Hide set timer"
        >
          Hide
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`font-mono tabular-nums text-4xl font-semibold flex-1 text-center ${
            done ? "text-emerald-300" : running && mode === "countdown" && remaining <= 10 ? "text-amber-300" : ""
          }`}
        >
          {display}
        </span>
        <div className="flex flex-col gap-1.5 w-24">
          {running ? (
            <Button size="sm" variant="outline" onClick={pause} className="h-10">Pause</Button>
          ) : (
            <Button size="sm" onClick={start} className="h-10 font-semibold">
              {done ? "Again" : accumulated > 0 ? "Resume" : "Start"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={reset} disabled={accumulated === 0 && !running} className="h-8 text-xs">
            Reset
          </Button>
        </div>
      </div>

      {mode === "countdown" && (
        <div className="flex gap-1 flex-wrap">
          {Array.from(new Set([...(defaultSeconds ? [defaultSeconds] : []), ...TIMED_PRESETS]))
            .sort((a, b) => a - b)
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => pick(s)}
                disabled={running}
                className={`px-2 py-1 rounded text-xs font-mono transition-colors disabled:opacity-40 ${
                  target === s ? "bg-blue-400/20 text-blue-200 border border-blue-400/40" : "bg-muted text-muted-foreground"
                }`}
              >
                {formatSeconds(s)}
              </button>
            ))}
        </div>
      )}
      {done && (
        <p className="text-xs text-emerald-300">Time — log the set below.</p>
      )}
    </div>
  );
}
