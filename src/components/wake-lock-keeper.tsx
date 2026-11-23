"use client";

import { useEffect } from "react";
import { useTimerSettings } from "@/lib/timer-settings";

/**
 * Keeps the screen awake while the app is open (Screen Wake Lock API —
 * Chrome/Android, and Safari on iOS 16.4+). Mounted once in the root layout;
 * driven by the "Keep screen awake" timer setting.
 *
 * The lock is released by the browser whenever the page is hidden, so we
 * re-request it on every return to the foreground. Browsers only grant a lock
 * to a visible page, and some need a user gesture first — the first tap on
 * the page re-arms it in that case. Unsupported browsers: silently no-op.
 */
export function WakeLockKeeper() {
  const { keepAwake } = useTimerSettings();

  useEffect(() => {
    if (!keepAwake) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
        sentinel.addEventListener("release", () => {
          sentinel = null;
        });
      } catch {
        // Denied (low battery / not allowed yet) — a later tap or
        // visibility change will retry.
        sentinel = null;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    const onTap = () => void request();

    void request();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("pointerdown", onTap, { passive: true });

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", onTap);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [keepAwake]);

  return null;
}
