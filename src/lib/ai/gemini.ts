import "server-only";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiModel() {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

/** Calls Gemini and parses a JSON response. Thinking is disabled for speed. */
export async function geminiJSON<T>(
  prompt: string | Part[],
  opts: { timeoutMs?: number; system?: string } = {},
): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const model = geminiModel();
  const parts = typeof prompt === "string" ? [{ text: prompt }] : prompt;
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    temperature: 0.2,
  };
  if (/2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      generationConfig,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
  });
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
