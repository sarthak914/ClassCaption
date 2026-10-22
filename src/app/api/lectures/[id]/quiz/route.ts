import { supabaseAdmin } from "@/lib/supabase/server";
import { body, HttpError, ok, route, type Ctx } from "@/lib/http";
import { lectureViewer } from "@/lib/access";
import { getStudent } from "@/lib/auth";
import { getLecture, notesIn } from "@/lib/lectures";
import { LANG_CODES } from "@/lib/languages";

/** quiz_attempts isn't there until schema.sql v5 is applied; scoring still works without it. */
const missingTable = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01";

/** The students.id of a signed-in student account, or null for teachers and device-only passes. */
async function accountId() {
  const s = await getStudent();
  return s?.acct ? s.sid : null;
}

/** GET /api/lectures/:id/quiz → { attempt: { score, total, best, attempts, lang } | null, account } (my saved result) */
export const GET = route(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  await lectureViewer(await getLecture(id));
  const acc = await accountId();
  if (!acc) return ok({ attempt: null, account: false });
  const { data, error } = await supabaseAdmin()
    .from("quiz_attempts")
    .select("score,total,best,attempts,lang")
    .eq("student_id", acc)
    .eq("lecture_id", id)
    .maybeSingle();
  if (error && !missingTable(error)) throw error;
  return ok({ attempt: data ?? null, account: true });
});

/**
 * POST /api/lectures/:id/quiz { lang, answers: number[] } → { score, total, saved, best?, attempts? }
 * Scores the lecture's AI quiz on the server (each language has its own quiz). For a signed-in
 * student account the result is saved, so the dashboard shows their best score.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  await lectureViewer(await getLecture(id));
  const b = await body<{ lang?: string; answers?: unknown }>(req);
  const lang = b.lang && LANG_CODES.includes(b.lang) ? b.lang : "en";
  if (!Array.isArray(b.answers)) throw new HttpError(400, "answers must be an array of option numbers");

  const quiz = (await notesIn(id, lang)).quiz ?? [];
  if (!quiz.length) throw new HttpError(409, "This lecture has no quiz yet");
  const raw = b.answers as unknown[];
  const answers = quiz.map((_, i) => (Number.isInteger(raw[i]) ? (raw[i] as number) : -1)); // -1 = not answered
  const score = quiz.filter((q, i) => answers[i] === q.answer_index).length;
  const total = quiz.length;

  const acc = await accountId();
  if (!acc) return ok({ score, total, saved: false });
  const db = supabaseAdmin();
  const { data: prev, error: readErr } = await db.from("quiz_attempts").select("best,attempts").eq("student_id", acc).eq("lecture_id", id).maybeSingle();
  if (missingTable(readErr)) return ok({ score, total, saved: false });
  if (readErr) throw readErr;
  const best = Math.max(score, prev?.best ?? 0);
  const attempts = (prev?.attempts ?? 0) + 1;
  const { error } = await db
    .from("quiz_attempts")
    .upsert({ student_id: acc, lecture_id: id, lang, score, total, best, attempts, answers, updated_at: new Date().toISOString() }, { onConflict: "student_id,lecture_id" });
  if (error) throw error;
  return ok({ score, total, saved: true, best, attempts });
});
