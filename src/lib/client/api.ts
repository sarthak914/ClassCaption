"use client";

/** JSON fetch against our own API; throws with the server's error message. */
export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    ...(json !== undefined
      ? { method: rest.method ?? "POST", headers: { "content-type": "application/json", ...rest.headers }, body: JSON.stringify(json) }
      : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** 75 → "01:15" */
export function mmss(secs: number) {
  const s = Math.max(0, Math.floor(secs || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Per-device preferences (language, name). Never required for the page to work. */
export function pref(key: "lang" | "name", fallback: string): string {
  try {
    return localStorage.getItem(`cc_${key}`) || fallback;
  } catch {
    return fallback;
  }
}
export function setPref(key: "lang" | "name", value: string) {
  try {
    localStorage.setItem(`cc_${key}`, value);
  } catch {}
}

/** Speak text aloud with the device voice for that language. */
export function speak(text: string, lang = "en-IN", rate = 1, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang.toLowerCase().slice(0, 2)));
  if (voice) u.voice = voice;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
}

export function sourceLabel(sourceLang?: string | null) {
  if (!sourceLang) return "Hinglish / English";
  if (sourceLang.startsWith("hi")) return "Hindi";
  if (sourceLang === "en-IN") return "Hinglish / English";
  return "English";
}

/**
 * Words worth a tap-to-explain: in an Indic-script caption these are the English-script
 * technical terms the translator keeps; in English, longer non-common words.
 */
const COMMON = new Set(
  "about above after again against because before being below between both could does doing during each further having here into itself just more most other over same should some such than that their theirs them then there these they this those through under until very what when where which while whom will with would your yours also like okay right today going wants something another without important example remember students student basically actually".split(
    " ",
  ),
);
export function techTerms(text: string): string[] {
  const latin = text.match(/[A-Za-z][A-Za-z0-9+#().-]*(?:\s+[A-Z][A-Za-z0-9+#-]*)*/g) ?? [];
  const indic = /[ऀ-෿؀-ۿ]/.test(text);
  const out = latin
    .map((w) => w.replace(/[().,-]+$/, ""))
    .filter((w) => (indic ? w.length >= 3 : w.length >= 8 || /^[A-Z]{2,}$/.test(w)))
    .filter((w) => !COMMON.has(w.toLowerCase()));
  return [...new Set(out)].slice(0, 4);
}
