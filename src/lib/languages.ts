export type Lang = { code: string; name: string; native: string; speech?: string };

/** Languages offered to students. `code` is ISO 639-1 (what Bhashini/Gemini use). */
export const LANGUAGES: Lang[] = [
  { code: "en", name: "English", native: "English", speech: "en-IN" },
  { code: "hi", name: "Hindi", native: "हिंदी", speech: "hi-IN" },
  { code: "mr", name: "Marathi", native: "मराठी", speech: "mr-IN" },
  { code: "bn", name: "Bengali", native: "বাংলা", speech: "bn-IN" },
  { code: "ta", name: "Tamil", native: "தமிழ்", speech: "ta-IN" },
  { code: "te", name: "Telugu", native: "తెలుగు", speech: "te-IN" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", speech: "gu-IN" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", speech: "kn-IN" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", speech: "ml-IN" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", speech: "pa-IN" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", speech: "or-IN" },
  { code: "ur", name: "Urdu", native: "اردو", speech: "ur-IN" },
];

export const LANG_CODES = LANGUAGES.map((l) => l.code);

export function langName(code: string) {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

/** "en-IN" → "en" */
export function baseLang(bcp47: string) {
  return bcp47.split("-")[0].toLowerCase();
}

/** en-IN speech is usually Hinglish, so even English readers get a cleaned-up translation. */
export function sourceIsMixed(sourceLang: string) {
  return sourceLang === "en-IN";
}

/**
 * Languages a teacher can lecture in. `code` is the Chrome Web Speech locale (live word preview),
 * `whisper` the Whisper language code for the accurate captions (undefined = Whisper auto-detects;
 * Whisper has no Odia model, so Odia relies on auto-detect plus the translator).
 */
export type SpeechLang = { code: string; label: string; short: string; whisper?: string };
export const SPEECH_LANGS: SpeechLang[] = [
  { code: "en-IN", label: "Hinglish / Indian English", short: "Hinglish / English", whisper: "en" },
  { code: "hi-IN", label: "Hindi (incl. Bhojpuri, Haryanvi, Rajasthani, Awadhi…)", short: "Hindi", whisper: "hi" },
  { code: "en-US", label: "English (US / UK)", short: "English", whisper: "en" },
  { code: "bn-IN", label: "Bengali", short: "Bengali", whisper: "bn" },
  { code: "ta-IN", label: "Tamil", short: "Tamil", whisper: "ta" },
  { code: "te-IN", label: "Telugu", short: "Telugu", whisper: "te" },
  { code: "mr-IN", label: "Marathi", short: "Marathi", whisper: "mr" },
  { code: "gu-IN", label: "Gujarati", short: "Gujarati", whisper: "gu" },
  { code: "kn-IN", label: "Kannada", short: "Kannada", whisper: "kn" },
  { code: "ml-IN", label: "Malayalam", short: "Malayalam", whisper: "ml" },
  { code: "pa-IN", label: "Punjabi", short: "Punjabi", whisper: "pa" },
  { code: "ur-IN", label: "Urdu", short: "Urdu", whisper: "ur" },
  { code: "or-IN", label: "Odia", short: "Odia" },
];
export const SPEECH_CODES = SPEECH_LANGS.map((l) => l.code);

export function speechLang(code?: string | null): SpeechLang {
  return SPEECH_LANGS.find((l) => l.code === code) ?? SPEECH_LANGS[0];
}

/**
 * A classroom's word list ("names and subject terms", one per line or comma-separated)
 * → clean, de-duplicated terms. Used in Whisper's prompt and the translator's instructions.
 */
export function glossaryTerms(text?: string | null): string[] {
  const out = (text ?? "")
    .split(/[\n,;]+/)
    .map((t) => t.trim().replace(/\s+/g, " ").slice(0, 60))
    .filter((t) => t.length > 1);
  return [...new Map(out.map((t) => [t.toLowerCase(), t])).values()].slice(0, 60);
}

/** UI aliases used by the screens. */
export type LanguageCode = string;
export const TARGET_LANGUAGES = LANGUAGES;
