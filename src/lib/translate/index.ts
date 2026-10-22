import "server-only";
import { geminiJSON } from "../ai/gemini";
import { groqJSON } from "../ai/groq";
import { langName } from "../languages";
import { bhashiniTranslate } from "./bhashini";
import { indicTrans2Translate } from "./indictrans2";

/**
 * A translator turns N source texts into N texts for each target language.
 * Result: { hi: [..N], ta: [..N] }.
 * Swap or reorder providers with TRANSLATION_PROVIDERS (e.g. "bhashini,indictrans2,gemini,google").
 */
export interface Translator {
  name: string;
  available(): boolean;
  translate(texts: string[], targets: string[], source: string, ctx?: TranslateContext): Promise<Record<string, string[]>>;
}

/** Optional help for the LLM translators: earlier lines of the lecture and the classroom's word list. */
export type TranslateContext = { previous?: string[]; glossary?: string[] };

const spokenAs = (source: string) =>
  source === "en"
    ? "English or Hinglish (Hindi-English mix, Hindi words often written in English letters)"
    : source === "hi"
    ? "Hindi, possibly a regional dialect (Bhojpuri, Haryanvi, Rajasthani, Awadhi, Maithili, Bundeli...) or mixed with English"
    : `${langName(source)}, possibly a regional dialect or mixed with English/Hindi`;

const llmPrompt = (texts: string[], targets: string[], source: string, ctx: TranslateContext = {}) => `You translate Indian college lecture captions.
The input is spoken ${spokenAs(source)} from a teacher, transcribed live by speech recognition, so it has little punctuation and may have errors: misheard words, wrong homophones, words split by pauses.
Teachers have every kind of accent and voice; some stutter, repeat words, speak slowly or have speech differences.
Translate every item into each target language: ${targets.map((t) => `${t} (${langName(t)})`).join(", ")}.
Rules:
- First work out what the teacher meant (use the earlier lines and the subject), silently fix obvious recognition mistakes, then translate that meaning. Never translate a misheard word literally.
- Drop stutters, repeated words, false starts and fillers ("um", "matlab", "basically" used as filler). Map regional dialect words to their standard meaning.
- Natural, simple, correctly punctuated sentences a student understands. "en" means clean, grammatical English (translate any Hindi or other-language parts).
- Keep technical/subject terms (e.g. "algorithm", "derivative", "photosynthesis") in English script inside the sentence when there is no common native word, and translate each term the same way every time.
- Keep numbers, units, names, code and formulas as-is.
- Same number of items, same order. Do not merge, split, summarise or add items. If an item is only noise or filler, return "" for it.
${ctx.glossary?.length ? `The teacher's own word list (names and subject terms). When a word sounds like one of these, it IS that term; spell it exactly like this: ${JSON.stringify(ctx.glossary)}\n` : ""}${ctx.previous?.length ? `Earlier lines of this lecture, for context only (do NOT translate them): ${JSON.stringify(ctx.previous)}\n` : ""}Return JSON exactly: {${targets.map((t) => `"${t}": ["..."]`).join(", ")}}
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
  async translate(texts, targets, source, ctx) {
    const live = texts.length <= 5;
    const out = await geminiJSON<Record<string, unknown>>(llmPrompt(texts, targets, source, ctx), {
      timeoutMs: live ? 5000 : 45000,
      retries: live ? 0 : 2, // live captions: fail fast and let Groq answer
    });
    return checkShape(out, texts, targets);
  },
};

const groq: Translator = {
  name: "groq",
  available: () => !!process.env.GROQ_API_KEY,
  async translate(texts, targets, source, ctx) {
    const out = await groqJSON<Record<string, unknown>>(llmPrompt(texts, targets, source, ctx), texts.length > 5 ? 45000 : 8000);
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

/** Self-hosted AI4Bharat IndicTrans2 (indictrans2/server.py). Best for clean English or Indic text; the LLMs handle Hinglish better. */
const indictrans2: Translator = {
  name: "indictrans2",
  available: () => !!process.env.INDICTRANS2_URL,
  translate: (texts, targets, source) => indicTrans2Translate(texts, source, targets),
};

const ALL: Record<string, Translator> = { bhashini, indictrans2, gemini, groq, google };

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
  opts: { keepSource?: boolean } & TranslateContext = {},
): Promise<{ provider: string; result: Record<string, string[]> }> {
  // keepSource: Hinglish tagged as "en" still needs a clean English version.
  const tgts = [...new Set(targets)].filter((t) => t && (opts.keepSource || t !== source));
  if (!texts.length || !tgts.length) return { provider: "none", result: {} };
  const errors: string[] = [];
  for (const t of chain()) {
    try {
      return { provider: t.name, result: await t.translate(texts, tgts, source, { previous: opts.previous, glossary: opts.glossary }) };
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
