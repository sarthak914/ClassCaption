import "server-only";
import { geminiJSON } from "../ai/gemini";
import { groqJSON } from "../ai/groq";
import { langName } from "../languages";
import { bhashiniTranslate } from "./bhashini";

/**
 * A translator turns N source texts into N texts for each target language.
 * Result: { hi: [..N], ta: [..N] }.
 * Swap or reorder providers with TRANSLATION_PROVIDERS (e.g. "bhashini,gemini,google").
 */
export interface Translator {
  name: string;
  available(): boolean;
  translate(texts: string[], targets: string[], source: string): Promise<Record<string, string[]>>;
}

const llmPrompt = (texts: string[], targets: string[], source: string) => `You translate Indian college lecture captions.
The input is spoken ${source === "hi" ? "Hindi" : "English or Hinglish (Hindi-English mix)"} from a teacher, transcribed by speech recognition, so it may have small errors.
Translate every item into each target language: ${targets.map((t) => `${t} (${langName(t)})`).join(", ")}.
Rules: natural, simple language a student understands; keep technical/subject terms (e.g. "algorithm", "derivative", "photosynthesis") in English script inside the sentence when there is no common native word; keep numbers and formulas as-is; same number of items, same order.
Return JSON exactly: {${targets.map((t) => `"${t}": ["..."]`).join(", ")}}
Input items (JSON array): ${JSON.stringify(texts)}`;

function checkShape(out: Record<string, unknown>, texts: string[], targets: string[]) {
  for (const t of targets) {
    const arr = out[t];
    if (!Array.isArray(arr) || arr.length !== texts.length) throw new Error(`bad shape for ${t}`);
  }
  return out as Record<string, string[]>;
}

const gemini: Translator = {
  name: "gemini",
  available: () => !!process.env.GEMINI_API_KEY,
  async translate(texts, targets, source) {
    const live = texts.length <= 5;
    const out = await geminiJSON<Record<string, unknown>>(llmPrompt(texts, targets, source), {
      timeoutMs: live ? 5000 : 45000,
      retries: live ? 0 : 2, // live captions: fail fast and let Groq answer
    });
    return checkShape(out, texts, targets);
  },
};

const groq: Translator = {
  name: "groq",
  available: () => !!process.env.GROQ_API_KEY,
  async translate(texts, targets, source) {
    const out = await groqJSON<Record<string, unknown>>(llmPrompt(texts, targets, source), texts.length > 5 ? 45000 : 8000);
    return checkShape(out, texts, targets);
  },
};

/** Keyless public Google Translate endpoint. Last-resort fallback so a demo never shows a blank. */
async function googleOne(q: string, sl: string, tl: string) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl || "auto"}&tl=${tl}&dt=t&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const data = await res.json();
  return (data[0] as [string][]).map((x) => x[0]).join("");
}

const google: Translator = {
  name: "google",
  available: () => true,
  async translate(texts, targets, source) {
    const result: Record<string, string[]> = {};
    // One request per language (texts joined by newlines) to stay under its rate limit.
    for (const tl of targets) {
      const joined = await googleOne(texts.join("\n"), source, tl);
      const parts = joined.split("\n").map((p) => p.trim());
      result[tl] = parts.length === texts.length ? parts : await Promise.all(texts.map((q) => googleOne(q, source, tl)));
    }
    return result;
  },
};

const bhashini: Translator = {
  name: "bhashini",
  available: () => !!(process.env.BHASHINI_USER_ID && process.env.BHASHINI_API_KEY),
  async translate(texts, targets, source) {
    const result: Record<string, string[]> = {};
    await Promise.all(targets.map(async (tl) => (result[tl] = await bhashiniTranslate(texts, source, tl))));
    return result;
  },
};

const ALL: Record<string, Translator> = { bhashini, gemini, groq, google };

function chain(): Translator[] {
  const order = (process.env.TRANSLATION_PROVIDERS || "bhashini,groq,gemini,google")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return order.map((n) => ALL[n]).filter((t): t is Translator => !!t && t.available());
}

/** Translate with automatic fallback through the provider chain. */
export async function translate(
  texts: string[],
  targets: string[],
  source = "en",
): Promise<{ provider: string; result: Record<string, string[]> }> {
  const tgts = [...new Set(targets)].filter((t) => t && t !== source);
  if (!texts.length || !tgts.length) return { provider: "none", result: {} };
  const errors: string[] = [];
  for (const t of chain()) {
    try {
      return { provider: t.name, result: await t.translate(texts, tgts, source) };
    } catch (e) {
      errors.push(`${t.name}: ${(e as Error).message}`);
    }
  }
  throw new Error(`All translators failed. ${errors.join(" | ")}`);
}

/** Translate large lists in chunks (used for recorded-lecture subtitles). */
export async function translateMany(texts: string[], target: string, source = "en", chunk = 40) {
  const out: string[] = [];
  for (let i = 0; i < texts.length; i += chunk) {
    const { result } = await translate(texts.slice(i, i + chunk), [target], source);
    out.push(...(result[target] ?? texts.slice(i, i + chunk)));
  }
  return out;
}
