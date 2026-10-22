import { supabaseAdmin } from "@/lib/supabase/server";
import { body, HttpError, need, ok, route, type Ctx } from "@/lib/http";
import { addEvent, translateForClass } from "@/lib/classes";
import { classForTeacher } from "@/lib/access";
import { baseLang } from "@/lib/languages";

/**
 * POST /api/class/:id/answer { questionId, text }   (the classroom's teacher)
 * Answers a student's question across languages: the teacher writes in the class language, the answer is
 * translated into the asker's language and every language the class is reading, saved on the question,
 * and pushed to students as an "answer" event. The asker's screen marks it as theirs; classmates see the
 * question and answer too, in their own language. The asker's name is never in the event.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const { cls } = await classForTeacher(id);
  if (cls.status !== "live") throw new HttpError(409, "Class has ended");
  const b = await body<{ questionId?: number | string; text?: string }>(req);
  const text = need(b.text?.trim().slice(0, 1000), "text is required");
  const qid = Number(need(b.questionId, "questionId is required"));

  const db = supabaseAdmin();
  const { data: q, error } = await db
    .from("reactions")
    .select("id,kind,text,lang,text_en")
    .eq("id", qid)
    .eq("class_id", id)
    .in("kind", ["question", "speak"])
    .maybeSingle();
  if (error) throw error;
  if (!q) throw new HttpError(404, "Question not found");

  const src = baseLang(cls.source_lang);
  const askedIn: string = q.lang || src;
  const [answerTr, questionTr] = await Promise.all([
    translateForClass(cls, [text], src, [askedIn]),
    askedIn !== src || !q.text_en ? translateForClass(cls, [q.text ?? ""], askedIn) : Promise.resolve({} as Record<string, string[]>),
  ]);
  const answer_translations = Object.fromEntries(Object.entries(answerTr).map(([l, v]) => [l, v[0]]));
  const question_translations = {
    ...Object.fromEntries(Object.entries(questionTr).map(([l, v]) => [l, v[0]])),
    [askedIn]: q.text ?? "",
    ...(q.text_en ? { [src]: q.text_en } : {}),
  };

  const answered_at = new Date().toISOString();
  const { error: upErr } = await db.from("reactions").update({ answer: text, answer_translations, answered_at }).eq("id", q.id);
  // Before schema v6 the answer can't be saved on the question, but students still receive it live.
  if (upErr && upErr.code !== "PGRST204") throw upErr;

  const event = await addEvent(id, "answer", {
    question_id: q.id,
    question: { text: q.text, lang: askedIn, translations: question_translations },
    answer: { text, lang: src, translations: answer_translations },
  });
  return ok({ event, answered_at }, 201);
});
