"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The device's best voice for a BCP-47 language ("ta-IN"): exact locale first, then any voice of that language. */
function pickVoice(voices: SpeechSynthesisVoice[], speechLang: string): SpeechSynthesisVoice | null {
  const norm = (l: string) => l.replace("_", "-").toLowerCase();
  const want = norm(speechLang);
  const base = want.split("-")[0];
  return (
    voices.find((v) => norm(v.lang) === want && v.localService) ??
    voices.find((v) => norm(v.lang) === want) ??
    voices.find((v) => norm(v.lang).split("-")[0] === base) ??
    null
  );
}

/**
 * Speaks live captions with the phone's own text-to-speech, so a student can listen through earphones.
 * Stays close to live: when lines arrive faster than they can be spoken, the backlog is dropped and
 * the newest line is read. Works offline once the device has a voice for the language.
 */
export function useCaptionVoice(speechLang: string, rate: number) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const pending = useRef(0);
  const generation = useRef(0);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const update = () => {
      const all = synth.getVoices();
      if (all.length) setVoicesLoaded(true);
      setVoice(pickVoice(all, speechLang));
    };
    update();
    synth.addEventListener("voiceschanged", update);
    return () => synth.removeEventListener("voiceschanged", update);
  }, [speechLang, supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    generation.current++;
    pending.current = 0;
    window.speechSynthesis.cancel();
  }, [supported]);

  const say = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;
      const synth = window.speechSynthesis;
      if (pending.current >= 2) stop(); // fell behind: skip to the newest line
      const gen = generation.current;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice?.lang ?? speechLang;
      if (voice) u.voice = voice;
      u.rate = rate;
      const done = () => {
        if (gen === generation.current) pending.current = Math.max(0, pending.current - 1);
      };
      u.onend = done;
      u.onerror = done;
      pending.current++;
      synth.speak(u);
    },
    [rate, speechLang, stop, supported, voice],
  );

  useEffect(() => stop, [stop]);

  // Until the voice list loads we don't know yet, so only report "missing" once it has.
  return { say, stop, supported, hasVoice: !!voice || !voicesLoaded };
}
