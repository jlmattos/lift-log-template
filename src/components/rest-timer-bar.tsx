"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatSeconds } from "@/lib/groups";
import { useTimerSettings } from "@/lib/timer-settings";
import { playAlarm, playTick, vibrate } from "@/lib/timer-audio";

export type RestTimerState = {
  /** Wall-clock epoch ms when the rest ends. Survives re-renders and reloads. */
  endsAt: number;
  /** Total planned rest, for the progress bar. */
  totalSeconds: number;
  /** What's next — "Weighted pull up" or "Round 3 · DB Bench Press". */
  label: string;
  /** Distinguishes a fresh timer from an adjusted one (keeps the alarm once-per-timer). */
  startedAt: number;
};

/**
 * Sticky rest countdown pinned above the bottom nav. Wall-clock anchored: it
 * reads the remaining time from `endsAt` on every tick rather than counting
 * down, so background throttling, router.refresh() re-renders and a page
 * reload never drift it. Alarm + vibration fire once when it crosses zero;
 * the bar then shows "Rest over" and auto-dismisses after a short grace period.
 */
export function RestTimerBar({
  timer,
  onAdjust,
  onDismiss,
}: {
  timer: RestTimerState;
  onAdjust: (deltaSeconds: number) => void;
  onDismiss: () => void;
}) {
  const settings = useTimerSettings();
  const [now, setNow] = useState(() => Date.now());
  const alarmedFor = useRef<number | null>(null);
  const lastTickSecond = useRef<number | null>(null);

  // 250ms cadence is plenty for a 1s display and cheap on battery.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    const onVisible = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const remainingMs = timer.endsAt - now;
  const remaining = Math.ceil(remainingMs / 1000);
  const over = remainingMs <= 0;
  const overBy = over ? Math.floor(-remainingMs / 1000) : 0;

  // Countdown ticks at 3, 2, 1.
  useEffect(() => {
    if (over || !settings.sound || !settings.countdownTicks) return;
    if (remaining <= 3 && remaining >= 1 && lastTickSecond.current !== remaining) {
      lastTickSecond.current = remaining;
      playTick(settings.volume);
    }
  }, [remaining, over, settings.sound, settings.countdownTicks, settings.volume]);

  // Alarm once per timer (adjusting +15s after zero re-arms it on purpose).
  useEffect(() => {
    if (!over) {
      if (alarmedFor.current === timer.endsAt) alarmedFor.current = null;
      return;
    }
    if (alarmedFor.current === timer.endsAt) return;
    alarmedFor.current = timer.endsAt;
    if (settings.sound) playAlarm(settings.alarmStyle, settings.volume, "rest");
    if (settings.vibrate) vibrate([200, 100, 200, 100, 400]);
  }, [over, timer.endsAt, settings.sound, settings.alarmStyle, settings.volume, settings.vibrate]);

  // Auto-dismiss 20s after the rest ended — long enough to notice, short
  // enough not to sit there through the next set.
  useEffect(() => {
    if (!over) return;
    const left = 20000 + remainingMs;
    if (left <= 0) {
      onDismiss();
      return;
    }
    const id = window.setTimeout(onDismiss, left);
    return () => window.clearTimeout(id);
  }, [over, remainingMs, onDismiss]);

  const progress = Math.max(0, Math.min(1, remainingMs / (timer.totalSeconds * 1000)));

  return (
    <div
      className="fixed left-0 right-0 z-40 px-3"
      style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
      role="timer"
      aria-live="polite"
    >
      <div
        className={`max-w-md lg:max-w-4xl mx-auto rounded-xl border shadow-lg backdrop-blur-lg overflow-hidden transition-colors ${
          over
            ? "border-emerald-400/60 bg-emerald-500/20"
            : remaining <= 10
              ? "border-amber-400/60 bg-amber-500/15"
              : "border-blue-400/40 bg-background/90"
        }`}
      >
        {/* progress rail */}
        <div className="h-1 bg-border/40">
          <div
            className={`h-full transition-[width] duration-200 ${over ? "bg-emerald-400" : "bg-blue-400"}`}
            style={{ width: `${(over ? 1 : 1 - progress) * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {over ? "Rest over" : "Resting"}
              {over && overBy >= 1 && <span className="font-normal normal-case"> · +{formatSeconds(overBy)}</span>}
            </p>
            <p className="text-sm leading-tight line-clamp-2">
              <span className="text-muted-foreground">Next · </span>
              {timer.label}
            </p>
          </div>
          <span
            className={`font-mono tabular-nums text-2xl font-semibold shrink-0 ${
              over ? "text-emerald-300" : remaining <= 10 ? "text-amber-300" : ""
            }`}
          >
            {over ? "0:00" : formatSeconds(remaining)}
          </span>
          <div className="flex flex-col gap-1 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onAdjust(15)}
              aria-label="Add 15 seconds"
            >
              +15s
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => (over ? onDismiss() : onAdjust(-15))}
              aria-label={over ? "Dismiss" : "Subtract 15 seconds"}
            >
              {over ? "Done" : "−15s"}
            </Button>
          </div>
          {!over && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-muted-foreground hover:text-foreground text-xs shrink-0 px-1"
              aria-label="Skip rest"
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
