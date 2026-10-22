"use client";

import { useEffect, useState } from "react";

/**
 * Keeps the screen on while `active` (teacher mic page, student captions).
 * Uses the Wake Lock API where it exists (Chrome/Edge, Safari 16.4+, https or localhost).
 * Over http://<laptop IP> on a LAN, phones don't offer it, so NoSleep.js falls back to a tiny
 * muted looping video; browsers only allow that after a tap, so we retry on the first tap.
 * Returns true while the screen is being kept awake.
 */
export function useWakeLock(active: boolean) {
  const [awake, setAwake] = useState(false);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    let cancelled = false;
    let noSleep: { enable(): Promise<void>; disable(): void; isEnabled: boolean } | null = null;

    const tryEnable = async () => {
      if (cancelled || !noSleep || noSleep.isEnabled) return;
      try {
        await noSleep.enable();
        if (!cancelled) setAwake(noSleep.isEnabled);
      } catch {
        // Not allowed yet (no tap so far): the next tap tries again.
      }
    };
    const onTap = () => void tryEnable();

    (async () => {
      const { default: NoSleep } = await import("nosleep.js");
      if (cancelled) return;
      noSleep = new NoSleep();
      await tryEnable();
      window.addEventListener("pointerdown", onTap);
      window.addEventListener("keydown", onTap);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", onTap);
      window.removeEventListener("keydown", onTap);
      noSleep?.disable();
      setAwake(false);
    };
  }, [active]);

  return awake;
}
