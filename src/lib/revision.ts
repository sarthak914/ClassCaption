import "server-only";
import { supabaseAdmin } from "./supabase/server";
import { HttpError } from "./http";
import { llmJSON } from "./ai/llm";
import { transcriptText } from "./ai/lecture";
import { langName, LANG_CODES } from "./languages";
import { getLecture, getSegments } from "./lectures";

/**
 * Spaced revision. The morning after a class, every student who attended gets 3 short questions from it
 * in the language they read it in; again 2 days after they finish that, and once more 4 days later
 * (roughly day 1, 3 and 7). Questions a student got wrong come back in the next round.
 * Students without an account are tracked by their device pass id, so it works for them too.
 */

export type RevisionQuestion = { question: string; options: string[]; answer_index: number; explanation: string };
export type RevisionRow = {
  id: number;
  student_sid: string;
  lecture_id: string;
  lang: string;
  step: number;
  due_at: string;
  questions: RevisionQuestion[] | null;
  answers: number[] | null;
  score: number | null;
  total: number | null;
  notified_at: string | null;
  done_at: string | null;
};

export const PER_ROUND = 3;
export const LAST_STEP = 3;
const POOL_SIZE = PER_ROUND * LAST_STEP;
const HOUR = 3600_000;
/** Days to wait after finishing a round before the next one is due. */
const GAP_DAYS: Record<number, number> = { 2: 2, 3: 4 };

/** Tables from schema v6 may not exist yet; revision features then quietly do nothing. */
export const missingTable = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01" || e?.code === "PGRST204";

/** 9:00 in India (03:30 UTC) on the next morning that is at least 12 hours away. */
export function nextMorning(from = Date.now()) {
  const d = new Date(from);
  d.setUTCHours(3, 30, 0, 0);
  while (d.getTime() - from < 12 * HOUR) d.setTime(d.getTime() + 24 * HOUR);
  return d;
}

const cleanLang = (lang?: string | null) => (lang && LANG_CODES.includes(lang) ? lang : "en");

/** A student opened a live class: remember them (and their language) for the morning revision. Never throws. */
export async function recordAttendance(classId: string, student: { sid: string; name: string }, lang: string) {
  const { error } = await supabaseAdmin()
    .from("attendance")
    .upsert({ class_id: classId, student_sid: student.sid, student_name: student.name, lang: cleanLang(lang) }, { onConflict: "class_id,student_sid" });
  if (error && !missingTable(error)) console.error("attendance:", error.message);
}

/** After a live class ends: first revision round for everyone who attended, due tomorrow morning. */
export async function scheduleForClass(classId: string, lectureId: string) {
  const db = supabaseAdmin();
  const { data, error } = await db.from("attendance").select("student_sid,lang").eq("class_id", classId);
  if (error) {
    if (!missingTable(error)) console.error("revision schedule:", error.message);
    return 0;
  }
  if (!data?.length) return 0;
  const due_at = nextMorning().toISOString();
  const rows = data.map((a) => ({ student_sid: a.student_sid, lecture_id: lectureId, lang: a.lang, step: 1, due_at }));
  const { error: insErr } = await db.from("revisions").upsert(rows, { onConflict: "student_sid,lecture_id,step", ignoreDuplicates: true });
  if (insErr) console.error("revision schedule:", insErr.message);
  return rows.length;
}

/** A student asks for revision of one lecture (e.g. a recording they watched). */
export async function scheduleOne(sid: string, lectureId: string, lang: string) {
  const due_at = nextMorning().toISOString();
  const { error } = await supabaseAdmin()
    .from("revisions")
    .upsert({ student_sid: sid, lecture_id: lectureId, lang: cleanLang(lang), step: 1, due_at }, { onConflict: "student_sid,lecture_id,step", ignoreDuplicates: true });
  if (error) throw missingTable(error) ? new HttpError(501, "Revision needs the v6 part of supabase/schema.sql") : error;
  return { due_at };
}

/** Nine revision questions for a lecture in one language, generated once and cached on the lecture. */
async function questionPool(lectureId: string, lang: string): Promise<RevisionQuestion[]> {
  const lec = await getLecture(lectureId);
  const cached: RevisionQuestion[] | undefined = lec.revision_sets?.[lang];
  if (cached?.length) return cached;
  const segs = await getSegments(lec.id);
  if (!segs.length) throw new HttpError(409, "This lecture has no transcript yet");
  const spikes = ((lec.confusion ?? []) as { count: number; text: string }[])
    .filter((c) => c.count > 0 && c.text)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((c) => c.text);
  const out = await llmJSON<{ questions: RevisionQuestion[] }>(
    `Write spaced-revision questions for students who attended this Indian college lecture yesterday.
Write in ${langName(lang)} (${lang}), simply. Keep technical terms in English in brackets when helpful.
Make ${POOL_SIZE} multiple-choice questions, 4 options each, testing recall and understanding of the most important ideas, not trivia.
Order them by importance: the first ${PER_ROUND} cover the core ideas. Each explanation is 1-2 sentences that teach the point again.
${spikes.length ? `Students tapped "I'm lost" at these moments; make sure some questions cover them: ${JSON.stringify(spikes)}\n` : ""}
Return JSON: {"questions": [{"question": "...", "options": ["a","b","c","d"], "answer_index": 0, "explanation": "..."}]}

TRANSCRIPT:
${transcriptText(segs, 60_000)}`,
    60000,
  );
  const pool = (out.questions ?? []).filter(
    (q) => q?.question && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer_index) && q.answer_index < q.options.length,
  );
  if (!pool.length) throw new Error("The AI returned no usable questions");
  const fresh = await getLecture(lec.id);
  const { error } = await supabaseAdmin()
    .from("lectures")
    .update({ revision_sets: { ...(fresh.revision_sets ?? {}), [lang]: pool } })
    .eq("id", lec.id);
  if (error && !missingTable(error)) console.error("revision cache:", error.message);
  return pool;
}

const same = (a: RevisionQuestion, b: RevisionQuestion) => a.question.trim() === b.question.trim();

/** This round's questions: last round's misses first, then the next unused ones from the pool. */
async function roundQuestions(row: RevisionRow): Promise<RevisionQuestion[]> {
  const pool = await questionPool(row.lecture_id, row.lang);
  const db = supabaseAdmin();
  const { data: earlier } = await db
    .from("revisions")
    .select("step,questions,answers")
    .eq("student_sid", row.student_sid)
    .eq("lecture_id", row.lecture_id)
    .lt("step", row.step)
    .order("step");
  const asked = (earlier ?? []).flatMap((r) => (r.questions ?? []) as RevisionQuestion[]);
  const prev = earlier?.at(-1);
  const missed = ((prev?.questions ?? []) as RevisionQuestion[]).filter((q, i) => prev?.answers?.[i] !== q.answer_index);
  const unused = pool.filter((q) => !asked.some((a) => same(a, q)));
  const picked = [...missed.slice(0, PER_ROUND - 1), ...unused];
  // A short pool (or a small lecture) can run out of new questions: reuse the earliest ones.
  for (const q of pool) if (picked.length < PER_ROUND && !picked.some((p) => same(p, q))) picked.push(q);
  return picked.slice(0, PER_ROUND);
}

async function ownRow(id: number, sid: string): Promise<RevisionRow> {
  const { data, error } = await supabaseAdmin().from("revisions").select("*").eq("id", id).eq("student_sid", sid).maybeSingle();
  if (error) throw missingTable(error) ? new HttpError(404, "Revision not found") : error;
  if (!data) throw new HttpError(404, "Revision not found");
  return data;
}

/** Opens a round (creating its questions on first open). Answers stay hidden until it is submitted. */
export async function openRevision(id: number, sid: string) {
  const row = await ownRow(id, sid);
  if (!row.questions?.length) {
    row.questions = await roundQuestions(row);
    await supabaseAdmin().from("revisions").update({ questions: row.questions, total: row.questions.length }).eq("id", row.id);
  }
  const lec = await getLecture(row.lecture_id);
  const done = !!row.done_at;
  return {
    id: row.id,
    step: row.step,
    lang: row.lang,
    lecture: { id: lec.id, title: lec.title, classroom: lec.classroom?.name ?? null },
    done,
    score: row.score,
    answers: row.answers,
    questions: row.questions.map((q) => (done ? q : { question: q.question, options: q.options })),
  };
}

/** Scores a round, then schedules the next one (until the last). */
export async function submitRevision(id: number, sid: string, raw: unknown) {
  const row = await ownRow(id, sid);
  if (row.done_at) throw new HttpError(409, "You already finished this revision");
  if (!row.questions?.length) throw new HttpError(409, "Open the revision first");
  if (!Array.isArray(raw)) throw new HttpError(400, "answers must be an array of option numbers");
  const answers = row.questions.map((_, i) => (Number.isInteger(raw[i]) ? (raw[i] as number) : -1));
  const score = row.questions.filter((q, i) => answers[i] === q.answer_index).length;
  const db = supabaseAdmin();
  const done_at = new Date().toISOString();
  const { error } = await db.from("revisions").update({ answers, score, total: row.questions.length, done_at }).eq("id", row.id);
  if (error) throw error;

  let next: { step: number; due_at: string } | null = null;
  if (row.step < LAST_STEP) {
    const step = row.step + 1;
    const due_at = nextMorning(Date.now() + (GAP_DAYS[step] - 1) * 24 * HOUR).toISOString();
    const { error: nErr } = await db
      .from("revisions")
      .upsert({ student_sid: sid, lecture_id: row.lecture_id, lang: row.lang, step, due_at }, { onConflict: "student_sid,lecture_id,step", ignoreDuplicates: true });
    if (nErr) console.error("next revision:", nErr.message);
    else next = { step, due_at };
  }
  return { score, total: row.questions.length, answers, questions: row.questions, next };
}

/** A student's rounds that are due now and the next ones coming up. */
export async function revisionsFor(sid: string) {
  const { data, error } = await supabaseAdmin()
    .from("revisions")
    .select("id,lecture_id,lang,step,due_at,done_at,score,total,lecture:lectures(title,classroom:classrooms(name))")
    .eq("student_sid", sid)
    .order("due_at")
    .limit(100);
  if (error) {
    if (missingTable(error)) return { due: [], upcoming: [], done: [] };
    throw error;
  }
  const now = Date.now();
  type Lec = { title: string; classroom: { name: string } | null } | null;
  const rows = (data ?? []).map((r) => {
    const lec = r.lecture as unknown as Lec;
    return { id: r.id, lecture_id: r.lecture_id, lang: r.lang, step: r.step, due_at: r.due_at, done_at: r.done_at, score: r.score, total: r.total, title: lec?.title ?? "Lecture", classroom: lec?.classroom?.name ?? null };
  });
  const open = rows.filter((r) => !r.done_at);
  return {
    due: open.filter((r) => new Date(r.due_at).getTime() <= now),
    upcoming: open.filter((r) => new Date(r.due_at).getTime() > now).slice(0, 5),
    done: rows.filter((r) => r.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!)).slice(0, 5),
  };
}

/** Teacher demo / "send now": make the first round of a lecture due right away. */
export async function makeDueNow(lectureId: string) {
  const { data, error } = await supabaseAdmin()
    .from("revisions")
    .update({ due_at: new Date().toISOString(), notified_at: null })
    .eq("lecture_id", lectureId)
    .eq("step", 1)
    .is("done_at", null)
    .select("id");
  if (error) throw missingTable(error) ? new HttpError(501, "Revision needs the v6 part of supabase/schema.sql") : error;
  return data?.length ?? 0;
}

/** For the class report: how the revision rounds of a lecture went. */
export async function revisionStats(lectureId: string) {
  const { data, error } = await supabaseAdmin().from("revisions").select("step,score,total,done_at,questions,answers").eq("lecture_id", lectureId);
  if (error) return null;
  const rows = data ?? [];
  const done = rows.filter((r) => r.done_at && r.total);
  const pct = done.length ? Math.round((100 * done.reduce((n, r) => n + r.score / r.total, 0)) / done.length) : null;
  // Questions most often missed, across students
  const misses = new Map<string, { question: string; asked: number; missed: number }>();
  for (const r of done) {
    ((r.questions ?? []) as RevisionQuestion[]).forEach((q, i) => {
      const m = misses.get(q.question) ?? { question: q.question, asked: 0, missed: 0 };
      m.asked++;
      if (r.answers?.[i] !== q.answer_index) m.missed++;
      misses.set(q.question, m);
    });
  }
  return {
    scheduled: rows.filter((r) => r.step === 1).length,
    completed: done.length,
    students_done: done.filter((r) => r.step === 1).length,
    avg_pct: pct,
    most_missed: [...misses.values()].filter((m) => m.missed > 0).sort((a, b) => b.missed / b.asked - a.missed / a.asked).slice(0, 3),
  };
}
