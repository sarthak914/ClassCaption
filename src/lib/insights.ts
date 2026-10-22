import "server-only";
import { supabaseAdmin } from "./supabase/server";
import { llmJSON } from "./ai/llm";
import { transcriptText } from "./ai/lecture";
import { langName } from "./languages";
import { getLecture, getSegments, type SegmentRow } from "./lectures";
import { revisionStats, missingTable } from "./revision";

/**
 * The teacher's one-page report after class: where students got lost, questions left unanswered,
 * how the pace felt, who read in which language, how quiz and revision went, and (from the AI)
 * the topics to revisit and how to open the next class. Numbers are computed; the AI only writes
 * the advice. Cached on the lecture and rebuilt when new data (questions, scores) arrives.
 */

export type Spike = { offset_s: number; count: number; text: string; before: string };
export type Question = { id: number; text: string; original: string | null; lang: string | null; asked_at_s: number; answer: string | null; name: string | null };
export type InsightsAI = {
  headline: string;
  revisit: { topic: string; why: string; try_this: string }[];
  unanswered: { theme: string; questions: string[]; suggested_answer: string }[];
  opener: string;
};
export type Insights = {
  lecture: { id: string; title: string; classroom: string | null; date: string; duration_s: number; source: string };
  attendance: { students: number; languages: { lang: string; name: string; count: number }[] } | null;
  pace: { avg_wpm: number; fast_minutes: number[]; per_minute: number[] };
  confusion: { total: number; spikes: Spike[]; buckets: number[] };
  questions: { total: number; answered: number; speak: number; list: Question[] };
  quiz: { students: number; avg_pct: number | null };
  revision: Awaited<ReturnType<typeof revisionStats>>;
  ai: InsightsAI | null;
  ai_error?: string;
  generated_at: string;
  fingerprint: string;
};

const FAST_WPM = 160; // above this, a minute of lecture is hard to follow in a second language
const BUCKETS = 24;

function wordsPerMinute(segs: SegmentRow[], duration: number) {
  const mins = Math.max(1, Math.ceil(duration / 60));
  const per = new Array(mins).fill(0);
  for (const s of segs) per[Math.min(mins - 1, Math.floor(s.start_s / 60))] += s.text.split(/\s+/).filter(Boolean).length;
  return per;
}

export async function buildInsights(lectureId: string, opts: { refresh?: boolean } = {}): Promise<Insights> {
  const lec = await getLecture(lectureId);
  const db = supabaseAdmin();
  const segs = await getSegments(lec.id);
  const duration = Math.max(lec.duration_s ?? 0, segs.at(-1)?.end_s ?? 0);

  const [reactRes, attendRes, quizRes, revision] = await Promise.all([
    lec.class_id
      ? db.from("reactions").select("*").eq("class_id", lec.class_id).order("created_at")
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    lec.class_id ? db.from("attendance").select("lang").eq("class_id", lec.class_id) : Promise.resolve({ data: null, error: null }),
    db.from("quiz_attempts").select("best,total").eq("lecture_id", lec.id),
    revisionStats(lec.id),
  ]);
  const reactions = (reactRes.data ?? []) as {
    id: number; kind: string; text: string | null; text_en: string | null; lang: string | null; offset_s: number; caption_seq: number | null; answer?: string | null; student_name: string | null;
  }[];

  // Confusion: the saved spikes (with the caption students were reading), plus a coarse timeline.
  const lost = reactions.filter((r) => r.kind === "lost");
  const saved = ((lec.confusion ?? []) as { offset_s: number; count: number; text: string; seq: number }[]).filter((c) => c.count > 0);
  const spikes: Spike[] = saved
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((c) => {
      const i = segs.findIndex((s) => s.start_s >= c.offset_s - 0.01);
      return { offset_s: c.offset_s, count: c.count, text: c.text, before: i > 0 ? segs[i - 1].text : "" };
    })
    .sort((a, b) => a.offset_s - b.offset_s);
  const buckets = new Array(BUCKETS).fill(0);
  const points = lost.length ? lost.map((r) => r.offset_s) : saved.flatMap((c) => new Array(c.count).fill(c.offset_s));
  if (duration > 0) for (const t of points) buckets[Math.min(BUCKETS - 1, Math.floor((t / duration) * BUCKETS))]++;

  const typed = reactions.filter((r) => r.kind === "question" || r.kind === "speak");
  const questions: Question[] = typed
    .filter((r) => r.kind === "question")
    .map((r) => ({
      id: r.id,
      text: r.text_en || r.text || "",
      original: r.text && r.text_en && r.text.trim() !== r.text_en.trim() ? r.text : null,
      lang: r.lang,
      asked_at_s: r.offset_s,
      answer: r.answer ?? null,
      name: r.student_name,
    }));

  const per = wordsPerMinute(segs, duration);
  const spoken = per.reduce((a, b) => a + b, 0);
  const activeMins = per.filter((w) => w > 0).length || 1;

  let attendance: Insights["attendance"] = null;
  if (attendRes.data && !missingTable(attendRes.error)) {
    const by = new Map<string, number>();
    for (const a of attendRes.data as { lang: string }[]) by.set(a.lang, (by.get(a.lang) ?? 0) + 1);
    attendance = {
      students: attendRes.data.length,
      languages: [...by].map(([lang, count]) => ({ lang, name: langName(lang), count })).sort((a, b) => b.count - a.count),
    };
  }
  const quizRows = (quizRes.data ?? []) as { best: number; total: number }[];

  const base = {
    lecture: {
      id: lec.id,
      title: lec.title,
      classroom: lec.classroom?.name ?? null,
      date: lec.created_at,
      duration_s: duration,
      source: lec.source,
    },
    attendance,
    pace: {
      avg_wpm: Math.round(spoken / activeMins),
      fast_minutes: per.map((w, i) => (w > FAST_WPM ? i : -1)).filter((i) => i >= 0),
      per_minute: per,
    },
    confusion: { total: points.length, spikes, buckets },
    questions: { total: questions.length, answered: questions.filter((q) => q.answer).length, speak: typed.length - questions.length, list: questions },
    quiz: { students: quizRows.length, avg_pct: quizRows.length ? Math.round((100 * quizRows.reduce((n, q) => n + q.best / q.total, 0)) / quizRows.length) : null },
    revision,
  };
  // Rebuild the AI part only when something it reads has changed.
  const fingerprint = [segs.length, points.length, questions.length, base.questions.answered, quizRows.length, revision?.completed ?? 0].join(":");
  const cached = lec.insights as Insights | null;
  if (!opts.refresh && cached?.ai && cached.fingerprint === fingerprint) {
    return { ...base, ai: cached.ai, generated_at: cached.generated_at, fingerprint };
  }

  let ai: InsightsAI | null = null;
  let ai_error: string | undefined;
  if (segs.length) {
    try {
      ai = await adviseTeacher(segs, base);
    } catch (e) {
      ai_error = (e as Error).message.slice(0, 200);
    }
  } else {
    ai_error = "No transcript yet";
  }
  const out: Insights = { ...base, ai, ...(ai_error ? { ai_error } : {}), generated_at: new Date().toISOString(), fingerprint };
  if (ai) {
    const { error } = await db.from("lectures").update({ insights: out }).eq("id", lec.id);
    if (error && !missingTable(error)) console.error("insights cache:", error.message);
  }
  return out;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

async function adviseTeacher(segs: SegmentRow[], d: Omit<Insights, "ai" | "generated_at" | "fingerprint">): Promise<InsightsAI> {
  const unanswered = d.questions.list.filter((q) => !q.answer).map((q) => q.text);
  const missed = d.revision?.most_missed.map((m) => m.question) ?? [];
  return llmJSON<InsightsAI>(
    `You help an Indian college teacher plan their next class from what happened in this one. Many students read the lecture as live translated captions in their own language, so jargon and speed hurt them most.
Write in clear, warm English for the teacher. Be specific to the content, never generic advice.

Data from the class:
- "I'm lost" taps (anonymous): ${d.confusion.total}. Biggest spikes (time, taps, what the teacher was saying): ${JSON.stringify(d.confusion.spikes.map((s) => ({ at: mmss(s.offset_s), taps: s.count, said: s.text, just_before: s.before })))}
- Questions not answered in class: ${JSON.stringify(unanswered.slice(0, 25))}
- Average pace ${d.pace.avg_wpm} words/min; minutes faster than ${FAST_WPM} wpm: ${JSON.stringify(d.pace.fast_minutes.map((m) => `${m}:00`))}
${d.quiz.avg_pct !== null ? `- Quiz average: ${d.quiz.avg_pct}% over ${d.quiz.students} students\n` : ""}${missed.length ? `- Revision questions students missed most (may be in an Indian language): ${JSON.stringify(missed)}\n` : ""}
Return JSON:
{
 "headline": "one sentence: how the class went and the single most important thing to fix",
 "revisit": [{"topic": "short topic name", "why": "the evidence from the data above", "try_this": "one concrete way to re-teach it (an analogy, example, or board sketch)"}],   // 1-3, most important first; empty if nothing stood out
 "unanswered": [{"theme": "short theme", "questions": ["the questions, verbatim"], "suggested_answer": "2-3 sentence answer the teacher can give"}],   // group similar questions; empty if none
 "opener": "2-3 sentences: how to open the next class (a recap question or quick check) based on this"
}

TRANSCRIPT:
${transcriptText(segs, 40_000)}`,
    60000,
  );
}
