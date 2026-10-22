import "server-only";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/** Must match vector(768) in supabase/schema.sql. */
export const EMBED_DIM = 768;

export function embedModel() {
  return process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
}

/**
 * Gemini embeddings (multilingual, so a Hindi or Hinglish question still finds English transcript lines).
 * "document" for transcript chunks, "query" for the student's question.
 */
export async function embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const model = embedModel();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const res = await fetch(`${BASE}/${model}:batchEmbedContents`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        requests: texts.slice(i, i + 100).map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType: kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
          outputDimensionality: EMBED_DIM,
        })),
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Gemini embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { embeddings?: { values: number[] }[] };
    const vecs = data.embeddings?.map((e) => e.values) ?? [];
    if (vecs.length !== Math.min(100, texts.length - i) || vecs.some((v) => v.length !== EMBED_DIM)) {
      throw new Error("Gemini embed returned the wrong shape");
    }
    out.push(...vecs);
  }
  return out;
}
