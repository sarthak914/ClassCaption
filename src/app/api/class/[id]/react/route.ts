import { supabaseAdmin } from "@/lib/supabase/server";
import { body, HttpError, ok, route, type Ctx } from "@/lib/http";
import { classForViewer } from "@/lib/access";
import { baseLang } from "@/lib/languages";
import { translate } from "@/lib/translate";
import { rateLimit } from "@/lib/ratelimit";
import { assertNotMuted, isInappropriate, rejectMessage } from "@/lib/moderation";

/**
 * POST /api/class/:id/react   (a student who joined this classroom)
 *   { kind: "lost", captionSeq? }                               → anonymous "I'm lost" tap
 *   { kind: "question", text, lang?, captionSeq?, anonymous? }  → typed doubt
 *   { kind: "speak", text, lang?, anonymous? }                  → "Speak for me" (teacher device reads it aloud)
 * The name comes from the student's pass, never from the request, so nobody can post as someone else.
 * Typed text is moderated (word filter + AI check) before it is stored or read aloud: abusive
 * messages get 422 and are never saved; three in 10 minutes mute that student for 10 minutes.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const b = await body<{ kind?: string; text?: string; lang?: string; captionSeq?: number; anonymous?: boolean }>(req);
  if (b.kind !== "lost" && b.kind !== "question" && b.kind !== "speak")
    throw new HttpError(400, 'kind must be "lost", "question" or "speak"');
  const typed = b.kind !== "lost";
  const text = b.text?.trim().slice(0, 500) ?? "";
  if (typed && !text) throw new HttpError(400, "text is required");

  const { cls, viewer } = await classForViewer(id);
  if (viewer.role !== "student") throw new HttpError(403, "Only students can send reactions");
  if (cls.status !== "live") throw new HttpError(409, "Class has ended");
  const sid = viewer.student.sid;
  if (b.kind === "lost") rateLimit(`lost:${id}:${sid}`, 1, 10, "You already tapped I'm lost");
  else {
    assertNotMuted(id, sid);
    rateLimit(`typed:${id}:${sid}`, 6, 60, "You're sending too fast");
  }

  let text_en: string | null = null;
  const src = baseLang(cls.source_lang);
  if (typed && b.lang && b.lang !== src) {
    try {
      text_en = (await translate([text], [src], b.lang)).result[src][0];
    } catch {
      text_en = null;
    }
  }
  if (typed) {
    const checks = await Promise.all([text, ...(text_en && text_en !== text ? [text_en] : [])].map((t) => isInappropriate(t)));
    if (checks.some(Boolean)) rejectMessage(id, sid, viewer.student.name, b.kind);
  }
  const row = {
    class_id: id,
    kind: b.kind,
    text: typed ? text : null,
    lang: b.lang ?? null,
    text_en: text_en ?? (typed ? text : null),
    student_name: typed && !b.anonymous ? viewer.student.name : null,
    student_sid: sid, // for the class report (distinct askers); never sent to the teacher
    caption_seq: typeof b.captionSeq === "number" ? b.captionSeq : null,
    offset_s: Math.max(0, (Date.now() - new Date(cls.started_at).getTime()) / 1000),
  };
  const insert = (r: Record<string, unknown>) => supabaseAdmin().from("reactions").insert(r).select("id,kind,created_at").single();
  let { data, error } = await insert(row);
  // Before schema v6 there is no student_sid column: save the question anyway.
  if (error?.code === "PGRST204") ({ data, error } = await insert({ ...row, student_sid: undefined }));
  if (error) throw error;
  return ok({ reaction: { ...data, text_en } }, 201);
});
