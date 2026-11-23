"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatSeconds } from "@/lib/groups";
import {
  REST_PRESETS,
  updateTimerSettings,
  useTimerSettings,
  type AlarmStyle,
} from "@/lib/timer-settings";
import { playAlarm, unlockAudio } from "@/lib/timer-audio";

const STYLES: { value: AlarmStyle; label: string }[] = [
  { value: "chime", label: "Chime" },
  { value: "bell", label: "Bell" },
  { value: "buzzer", label: "Buzzer" },
];

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <Label className="text-sm">{label}</Label>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Device-local timer preferences: auto rest, sounds, vibration, wake lock. */
export function TimerSettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const s = useTimerSettings();
  const wakeLockSupported =
    typeof navigator !== "undefined" && "wakeLock" in navigator;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Timers</SheetTitle>
        </SheetHeader>
        <div className="mt-2 divide-y divide-border/40">
          <Row label="Auto rest timer" hint="Starts after every logged set">
            <Switch checked={s.autoRest} onCheckedChange={(v) => updateTimerSettings({ autoRest: v })} />
          </Row>

          <div className="py-2">
            <Label className="text-sm">Default rest</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Used when the exercise has no rest set in its template
            </p>
            <div className="flex gap-1 flex-wrap mt-2">
              {REST_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => updateTimerSettings({ defaultRestSeconds: r })}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    s.defaultRestSeconds === r
                      ? "bg-blue-400/20 text-blue-200 border border-blue-400/40"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {formatSeconds(r)}
                </button>
              ))}
            </div>
          </div>

          <Row label="Alarm sound" hint="Plays while the app is on screen. iPhone: obeys the silent switch.">
            <Switch checked={s.sound} onCheckedChange={(v) => updateTimerSettings({ sound: v })} />
          </Row>

          {s.sound && (
            <>
              <div className="py-2">
                <Label className="text-sm">Sound</Label>
                <div className="flex gap-1 mt-2">
                  {STYLES.map((st) => (
                    <button
                      key={st.value}
                      type="button"
                      onClick={() => {
                        unlockAudio();
                        updateTimerSettings({ alarmStyle: st.value });
                        playAlarm(st.value, s.volume, "rest");
                      }}
                      className={`flex-1 h-9 rounded text-sm transition-colors ${
                        s.alarmStyle === st.value
                          ? "bg-blue-400/20 text-blue-200 border border-blue-400/40"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Tap a style to preview it.</p>
              </div>

              <div className="py-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Volume</Label>
                  <span className="text-xs font-mono text-muted-foreground">{Math.round(s.volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={s.volume}
                  onChange={(e) => updateTimerSettings({ volume: parseFloat(e.target.value) })}
                  onPointerUp={() => {
                    unlockAudio();
                    playAlarm(s.alarmStyle, s.volume, "rest");
                  }}
                  className="w-full mt-2 accent-blue-400"
                  aria-label="Alarm volume"
                />
              </div>

              <Row label="Countdown ticks" hint="Soft tick at 3, 2, 1">
                <Switch checked={s.countdownTicks} onCheckedChange={(v) => updateTimerSettings({ countdownTicks: v })} />
              </Row>
            </>
          )}

          <Row label="Vibrate" hint="Android only — iPhone Safari ignores web vibration">
            <Switch checked={s.vibrate} onCheckedChange={(v) => updateTimerSettings({ vibrate: v })} />
          </Row>

          <Row
            label="Keep screen awake"
            hint={
              wakeLockSupported
                ? "While the app is open, so the alarm can sound and the timer stays visible"
                : "Not supported by this browser"
            }
          >
            <Switch
              checked={s.keepAwake}
              disabled={!wakeLockSupported}
              onCheckedChange={(v) => updateTimerSettings({ keepAwake: v })}
            />
          </Row>
        </div>

        <p className="text-[11px] text-muted-foreground mt-3">
          Timers are anchored to the clock, so they stay accurate if the screen locks — but a web
          app can&apos;t play sound while locked or in the background. The alarm fires the moment you
          come back.
        </p>

        <Button variant="outline" className="w-full mt-4" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </SheetContent>
    </Sheet>
  );
}
