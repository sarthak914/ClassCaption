import { supabaseAdmin } from "@/lib/supabase/server";
import { body, HttpError, ok, route, type Ctx } from "@/lib/http";
import { getClass } from "@/lib/classes";
import { baseLang } from "@/lib/languages";
import { translate } from "@/lib/translate";

/**
 * POST /api/class/:id/react
 *   { kind: "lost", captionSeq? }                      → anonymous "I'm lost" tap
 *   { kind: "question", text, lang?, captionSeq? }    → typed doubt / "Speak for me"
 * The row reaches the teacher via Realtime (table `reactions`).
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const b = await body<{ kind?: string; text?: string; lang?: string; captionSeq?: number }>(req);
  if (b.kind !== "lost" && b.kind !== "question") throw new HttpError(400, 'kind must be "lost" or "question"');
  if (b.kind === "question" && !b.text?.trim()) throw new HttpError(400, "text is required for a question");
  const cls = await getClass(id);
  if (cls.status !== "live") throw new HttpError(409, "Class has ended");

  let text_en: string | null = null;
  const src = baseLang(cls.source_lang);
  if (b.kind === "question" && b.lang && b.lang !== src) {
    try {
      text_en = (await translate([b.text!], [src], b.lang)).result[src][0];
    } catch {
      text_en = null;
    }
  }
  const { data, error } = await supabaseAdmin()
    .from("reactions")
    .insert({
      class_id: id,
      kind: b.kind,
      text: b.text?.trim() ?? null,
      lang: b.lang ?? null,
      text_en: text_en ?? (b.kind === "question" ? b.text!.trim() : null),
      caption_seq: typeof b.captionSeq === "number" ? b.captionSeq : null,
      offset_s: Math.max(0, (Date.now() - new Date(cls.started_at).getTime()) / 1000),
    })
    .select("*")
    .single();
  if (error) throw error;
  return ok({ reaction: data }, 201);
});
