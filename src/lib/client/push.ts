"use client";

import { api } from "./api";

/** Browser support for revision reminders: service worker + Push, on https or localhost. */
export function pushSupported() {
  return typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

const toKey = (b64: string) => {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Is this browser already subscribed? */
export async function remindersOn(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return !!(await reg?.pushManager.getSubscription());
}

/** Asks for permission and subscribes this browser to revision reminders in `lang`. */
export async function enableReminders(lang: string) {
  if (!pushSupported()) throw new Error("This browser can't show reminders. Open ClassCaption over https (or add it to your home screen on iPhone).");
  const { publicKey } = await api<{ publicKey: string | null }>("/api/push");
  if (!publicKey) throw new Error("Reminders aren't set up on this server yet. Your revisions still show here every morning.");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked for this site. Allow them in the browser settings.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
  await api("/api/push", { json: { subscription: sub.toJSON(), lang } });
}

export async function disableReminders() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api("/api/push", { method: "DELETE", json: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
}
