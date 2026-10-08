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

/** Teacher speech languages supported by Chrome's Web Speech API. */
export const SPEECH_LANGS = [
  { code: "en-IN", label: "English (India) / Hinglish" },
  { code: "hi-IN", label: "Hindi" },
  { code: "en-US", label: "English (US)" },
];

/** UI aliases used by the screens. */
export type LanguageCode = string;
export const TARGET_LANGUAGES = LANGUAGES;
