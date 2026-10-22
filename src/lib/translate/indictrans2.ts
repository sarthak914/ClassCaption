import "server-only";

// AI4Bharat IndicTrans2, served by indictrans2/server.py (open source, runs on the laptop or a GPU box).
// One request translates N texts into every target language.
export async function indicTrans2Translate(texts: string[], src: string, targets: string[]): Promise<Record<string, string[]>> {
  const base = process.env.INDICTRANS2_URL!.replace(/\/+$/, "");
  const key = process.env.INDICTRANS2_API_KEY;
  // IndicTrans2 can't "clean up" English into English, so an en → en target keeps the original text.
  const tgts = targets.filter((t) => t !== src);
  const result: Record<string, string[]> = {};
  if (tgts.length) {
    const res = await fetch(`${base}/translate`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ texts, src, tgt: tgts }),
      signal: AbortSignal.timeout(texts.length > 5 ? 60000 : 8000),
    });
    if (!res.ok) throw new Error(`IndicTrans2 ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { translations?: Record<string, string[]> };
    for (const t of tgts) {
      const arr = data.translations?.[t];
      if (!Array.isArray(arr) || arr.length !== texts.length) throw new Error(`IndicTrans2 returned the wrong shape for ${t}`);
      result[t] = arr;
    }
  }
  if (targets.includes(src)) result[src] = [...texts];
  return result;
}
