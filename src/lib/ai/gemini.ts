import "server-only";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

let resolvedModel: string | null = null;

export function geminiModel() {
  return resolvedModel || process.env.GEMINI_MODEL || "gemini-flash-latest";
}

/**
 * Google retires model names often (and blocks old ones for new keys). If the
 * configured model 404s, pick the newest "flash" model this key can use.
 */
async function discoverModel(key: string): Promise<string> {
  const res = await fetch(`${BASE}?pageSize=200`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Gemini model list ${res.status}`);
  const { models = [] } = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const version = (n: string) => Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const candidates = models
    .map((m) => ({ id: m.name.replace(/^models\//, ""), methods: m.supportedGenerationMethods ?? [] }))
    .filter((m) => m.methods.includes("generateContent"))
    .filter((m) => /flash/.test(m.id) && !/(image|tts|audio|live|embedding|thinking|exp)/.test(m.id))
    .sort((a, b) => {
      const lite = Number(/lite/.test(a.id)) - Number(/lite/.test(b.id)); // prefer non-lite
      const preview = Number(/preview/.test(a.id)) - Number(/preview/.test(b.id)); // prefer stable
      return lite || preview || version(b.id) - version(a.id);
    });
  if (!candidates.length) throw new Error("No Gemini flash model available for this API key");
  return candidates[0].id;
}

export type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

/** Calls Gemini and parses a JSON response. Thinking is disabled for speed. */
export async function geminiJSON<T>(
  prompt: string | Part[],
  opts: { timeoutMs?: number; system?: string; retries?: number } = {},
): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const parts = typeof prompt === "string" ? [{ text: prompt }] : prompt;
  const call = (model: string) => {
    const generationConfig: Record<string, unknown> = { responseMimeType: "application/json", temperature: 0.2 };
    if (/2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 }; // faster
    return fetch(`${BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
        generationConfig,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
    });
  };

  let res = await call(geminiModel());
  // "high demand" (503) / rate limit (429): back off and retry. Live captions pass retries: 0
  // so the translator chain can fall back to Groq immediately instead.
  const delays = [1000, 3000, 6000].slice(0, opts.retries ?? 2);
  for (const d of delays) {
    if (res.status !== 503 && res.status !== 429) break;
    await new Promise((r) => setTimeout(r, d));
    res = await call(geminiModel());
  }
  if (res.status === 404 && !resolvedModel) {
    resolvedModel = await discoverModel(key);
    console.warn(`Gemini model ${process.env.GEMINI_MODEL || "gemini-flash-latest"} unavailable, using ${resolvedModel}`);
    res = await call(resolvedModel);
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("");
  if (!text) throw new Error("Gemini returned no text");
  return parseJSON<T>(text);
}

export function parseJSON<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  return JSON.parse(cleaned) as T;
}
