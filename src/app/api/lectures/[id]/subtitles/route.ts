import { ok, route, type Ctx } from "@/lib/http";
import { segmentsIn, toVTT } from "@/lib/lectures";

export const maxDuration = 120;

/**
 * GET /api/lectures/:id/subtitles?lang=hi&format=vtt|json
 * WebVTT for <track src=...>, or JSON cues. Translations are made on first request and cached.
 */
export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") || "en";
  const cues = await segmentsIn(id, lang);
  if (url.searchParams.get("format") === "json") {
    return ok({ lang, cues: cues.map((c) => ({ idx: c.idx, start_s: c.start_s, end_s: c.end_s, text: c.out, original: c.text })) });
  }
  return new Response(toVTT(cues), { headers: { "content-type": "text/vtt; charset=utf-8" } });
});
