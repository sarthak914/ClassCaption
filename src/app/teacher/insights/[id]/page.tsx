"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Check, HelpCircle, Languages, MessageSquare, Printer, RefreshCw, Repeat, Sparkles, Timer } from "lucide-react";
import { Navbar } from "@/components/navigation/Navbar";
import { api, mmss, needsAuth } from "@/lib/client/api";
import { langName } from "@/lib/languages";

type Spike = { offset_s: number; count: number; text: string; before: string };
type Question = { id: number; text: string; original: string | null; lang: string | null; asked_at_s: number; answer: string | null; name: string | null };
type Insights = {
  lecture: { id: string; title: string; classroom: string | null; date: string; duration_s: number; source: string };
  attendance: { students: number; languages: { lang: string; name: string; count: number }[] } | null;
  pace: { avg_wpm: number; fast_minutes: number[]; per_minute: number[] };
  confusion: { total: number; spikes: Spike[]; buckets: number[] };
  questions: { total: number; answered: number; speak: number; list: Question[] };
  quiz: { students: number; avg_pct: number | null };
  revision: { scheduled: number; completed: number; students_done: number; avg_pct: number | null } | null;
  ai: {
    headline: string;
    revisit: { topic: string; why: string; try_this: string }[];
    unanswered: { theme: string; questions: string[]; suggested_answer: string }[];
    opener: string;
  } | null;
  ai_error?: string;
  generated_at: string;
};

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="cc-card p-4">
      <span className="cc-eyebrow block mb-1">{label}</span>
      <span className="font-mono text-2xl text-ink block leading-none">{value}</span>
      {note && <span className="text-[11px] text-ink-3 block mt-1.5">{note}</span>}
    </div>
  );
}

/** "I'm lost" taps across the lecture: one thin bar per slice of time, the spikes labelled by time. */
function ConfusionTimeline({ buckets, duration, spikes }: { buckets: number[]; duration: number; spikes: Spike[] }) {
  const max = Math.max(1, ...buckets);
  const slice = duration / buckets.length;
  return (
    <figure className="space-y-1.5">
      <div className="flex items-end gap-[2px] h-24 border-b border-rule-strong" role="img" aria-label="I'm lost taps over the lecture">
        {buckets.map((n, i) => (
          <div key={i} className="group relative flex-1 h-full flex items-end">
            <div
              className={`w-full rounded-t-[4px] ${n ? "bg-sindoor" : "bg-transparent"}`}
              style={{ height: n ? `${Math.max(6, (n / max) * 100)}%` : 0 }}
            />
            {/* hover target is the whole column, wider than the bar */}
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded-md bg-ink text-paper text-[11px] px-2 py-1 opacity-0 group-hover:opacity-100 transition print:hidden z-10">
              {mmss(i * slice)}–{mmss((i + 1) * slice)} · {n} tap{n === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-ink-3">
        <span>0:00</span>
        {spikes[0] && <span className="text-sindoor-deep">peak at {mmss([...spikes].sort((a, b) => b.count - a.count)[0].offset_s)}</span>}
        <span>{mmss(duration)}</span>
      </div>
    </figure>
  );
}

function InsightsContent({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Insights | null>(null);
  const [push, setPush] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [sendMsg, setSendMsg] = useState("");

  const load = async (refresh = false) => {
    setRefreshing(true);
    try {
      const r = await api<{ insights: Insights; push: boolean }>(`/api/lectures/${id}/insights${refresh ? "?refresh=1" : ""}`);
      setData(r.insights);
      setPush(r.push);
      setError("");
    } catch (err) {
      if (needsAuth(err)) return router.replace(`/teacher/login?next=/teacher/insights/${id}`);
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendRevision = async () => {
    setSendMsg("Sending...");
    try {
      const r = await api<{ due: number; configured: boolean; students: number; sent: number }>(`/api/lectures/${id}/revision/send`, { method: "POST" });
      setSendMsg(
        !r.due
          ? "No students are waiting on a first round for this lecture."
          : r.configured
          ? `Revision is open now for ${r.due} student${r.due === 1 ? "" : "s"}; ${r.sent} phone notification${r.sent === 1 ? "" : "s"} sent.`
          : `Revision is open now for ${r.due} student${r.due === 1 ? "" : "s"}. They see it on their home screen.`,
      );
    } catch (err) {
      setSendMsg((err as Error).message);
    }
  };

  if (error) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-3">
        <p className="text-sm font-semibold text-sindoor-deep">{error}</p>
        <Link href="/teacher/dashboard" className="text-sm font-bold text-neel underline">Back to dashboard</Link>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <section className="cc-board cc-kolam-light p-8 text-center">
          <p className="text-chalk-dim">Reading the class: confusion taps, questions, pace and scores...</p>
        </section>
      </main>
    );
  }

  const { lecture, confusion, questions, pace, quiz, revision, attendance, ai } = data;
  const unanswered = questions.list.filter((q) => !q.answer);
  const live = lecture.source === "live";

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6 print:py-0">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="cc-eyebrow mb-1">Class report</p>
          <h1 className="text-3xl sm:text-4xl font-normal leading-tight">{lecture.title}</h1>
          <p className="text-sm text-ink-3 mt-1">
            {[lecture.classroom, new Date(lecture.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }), `${Math.round(lecture.duration_s / 60)} min`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button onClick={() => load(true)} disabled={refreshing} className="cc-btn h-10 px-3 text-xs">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button onClick={() => window.print()} className="cc-btn h-10 px-3 text-xs">
            <Printer className="w-4 h-4" />
            Print
          </button>
          <Link href={`/student/lectures/${lecture.id}`} className="cc-btn cc-btn-primary h-10 px-3 text-xs">
            Lecture hub
          </Link>
        </div>
      </section>

      {/* The headline, on the board */}
      <section className="cc-board p-6 space-y-2">
        <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-chalk-dim flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-chalk-yellow" />
          In one line
        </span>
        <p className="text-xl sm:text-2xl text-chalk leading-snug">
          {ai?.headline ?? (data.ai_error ? "The AI summary isn't available right now; the numbers below are complete." : "...")}
        </p>
      </section>

      {/* Numbers */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Students" value={attendance ? String(attendance.students) : "—"} note={attendance?.languages.length ? `${attendance.languages.length} language${attendance.languages.length === 1 ? "" : "s"}` : live ? undefined : "Recording"} />
        <Tile label="I'm lost" value={String(confusion.total)} note={confusion.spikes.length ? `${confusion.spikes.length} spike${confusion.spikes.length === 1 ? "" : "s"}` : "No spikes"} />
        <Tile label="Questions" value={`${questions.answered}/${questions.total}`} note="answered in class" />
        <Tile label="Pace" value={`${pace.avg_wpm}`} note={pace.fast_minutes.length ? `wpm · ${pace.fast_minutes.length} fast minute${pace.fast_minutes.length === 1 ? "" : "s"}` : "words per minute"} />
      </section>

      <div className="grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {/* Revisit next class */}
          <section className="space-y-3">
            <h2 className="text-2xl font-normal">Revisit next class</h2>
            {!ai && <p className="text-sm text-ink-3">{data.ai_error ? `AI advice unavailable: ${data.ai_error}` : "Writing..."}</p>}
            {ai && !ai.revisit.length && <p className="text-sm text-ink-3">Nothing stood out. The class followed along.</p>}
            {ai?.revisit.map((r, i) => (
              <article key={i} className="cc-card p-5 space-y-2 border-l-4 !border-l-sindoor">
                <h3 className="text-lg font-medium">
                  <span className="font-heading italic text-sindoor mr-1.5">{i + 1}.</span>
                  {r.topic}
                </h3>
                <p className="text-sm text-ink-2">{r.why}</p>
                <p className="text-sm text-ink">
                  <span className="font-semibold text-neel">Try this: </span>
                  {r.try_this}
                </p>
              </article>
            ))}
            {ai?.opener && (
              <div className="rounded-card bg-haldi-wash border border-haldi-line p-4 text-sm text-haldi-ink">
                <span className="font-semibold">Open the next class with: </span>
                {ai.opener}
              </div>
            )}
          </section>

          {/* Where they got lost */}
          <section className="cc-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-sindoor" />
              <h2 className="text-lg font-medium">Where students got lost</h2>
            </div>
            {confusion.total ? (
              <>
                <ConfusionTimeline buckets={confusion.buckets} duration={lecture.duration_s} spikes={confusion.spikes} />
                <ol className="space-y-2.5">
                  {confusion.spikes.map((s, i) => (
                    <li key={i} className="text-sm flex gap-3">
                      <span className="font-mono text-xs text-sindoor-deep w-12 flex-shrink-0 pt-0.5">{mmss(s.offset_s)}</span>
                      <span className="min-w-0">
                        <span className="text-ink">&ldquo;{s.text}&rdquo;</span>
                        <span className="text-ink-3"> · {s.count} tap{s.count === 1 ? "" : "s"}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-sm text-ink-3">No &ldquo;I&apos;m lost&rdquo; taps in this class.</p>
            )}
          </section>

          {/* Unanswered questions */}
          <section className="space-y-3">
            <h2 className="text-2xl font-normal">Questions still open</h2>
            {!unanswered.length && <p className="text-sm text-ink-3">{questions.total ? "You answered every question. " : "No typed questions this class."}</p>}
            {ai?.unanswered.length
              ? ai.unanswered.map((g, i) => (
                  <article key={i} className="cc-card p-5 space-y-2">
                    <h3 className="text-base font-semibold">{g.theme}</h3>
                    <ul className="space-y-1">
                      {g.questions.map((q, j) => (
                        <li key={j} className="text-sm text-ink-2 font-heading italic">&ldquo;{q}&rdquo;</li>
                      ))}
                    </ul>
                    <p className="text-sm text-ink border-l-2 border-patta-line pl-3">
                      <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-patta block">Suggested answer</span>
                      {g.suggested_answer}
                    </p>
                  </article>
                ))
              : unanswered.map((q) => (
                  <div key={q.id} className="cc-card p-4 text-sm">
                    <p className="text-ink">&ldquo;{q.text}&rdquo;</p>
                    {q.original && q.lang && (
                      <p className="text-xs text-ink-3 mt-1" lang={q.lang}>
                        Asked in {langName(q.lang)}: {q.original}
                      </p>
                    )}
                  </div>
                ))}
          </section>
        </div>

        <aside className="space-y-5 min-w-0">
          {/* Languages */}
          {attendance && attendance.languages.length > 0 && (
            <section className="cc-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-neel" />
                <h2 className="text-lg font-medium">Read in</h2>
              </div>
              <ul className="space-y-2">
                {attendance.languages.map((l) => (
                  <li key={l.lang} className="text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-ink">{l.name}</span>
                      <span className="font-mono text-xs text-ink-3">{l.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-paper-2 overflow-hidden">
                      <div className="h-full rounded-full bg-neel" style={{ width: `${(l.count / attendance.students) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Pace */}
          <section className="cc-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-haldi-deep" />
              <h2 className="text-lg font-medium">Pace</h2>
            </div>
            <p className="text-sm text-ink-2">
              {pace.avg_wpm} words a minute on average.{" "}
              {pace.fast_minutes.length
                ? `Fast at ${pace.fast_minutes.slice(0, 4).map((m) => `${m}:00`).join(", ")}${pace.fast_minutes.length > 4 ? "..." : ""}. Students reading a translation fall behind above about 160.`
                : "Comfortable for students reading a translation."}
            </p>
          </section>

          {/* Questions answered */}
          {questions.answered > 0 && (
            <section className="cc-card p-5 space-y-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-patta" />
                <h2 className="text-lg font-medium">Answered across languages</h2>
              </div>
              <ul className="space-y-1.5">
                {questions.list
                  .filter((q) => q.answer)
                  .slice(0, 5)
                  .map((q) => (
                    <li key={q.id} className="text-sm text-ink-2 flex gap-2">
                      <Check className="w-4 h-4 text-patta flex-shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        {q.text}
                        {q.lang && q.original ? <span className="text-ink-3"> · {langName(q.lang)}</span> : null}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {/* Quiz and revision */}
          <section className="cc-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-neel" />
              <h2 className="text-lg font-medium">Quiz and revision</h2>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-3">Quiz average</dt>
                <dd className="font-mono text-lg">{quiz.avg_pct === null ? "—" : `${quiz.avg_pct}%`}</dd>
                <dd className="text-[11px] text-ink-3">{quiz.students} student{quiz.students === 1 ? "" : "s"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Revision average</dt>
                <dd className="font-mono text-lg">{revision?.avg_pct == null ? "—" : `${revision.avg_pct}%`}</dd>
                <dd className="text-[11px] text-ink-3">
                  {revision ? `${revision.students_done}/${revision.scheduled} did day 1` : "Needs schema v6"}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-ink-3">
              Students who were in class get 3 questions tomorrow morning in their language, then on day 3 and day 7.
            </p>
            <div className="print:hidden space-y-1.5">
              <button onClick={sendRevision} className="cc-btn cc-btn-haldi h-10 px-4 text-xs w-full">
                <BellRing className="w-4 h-4" />
                Send revision now
              </button>
              {!push && <p className="text-[11px] text-ink-3">Phone notifications need VAPID keys on the server; students still see revision on their home screen.</p>}
              {sendMsg && <p className="text-xs text-ink-2">{sendMsg}</p>}
            </div>
          </section>
        </aside>
      </div>

      <p className="text-[11px] text-ink-4 text-center">
        Generated {new Date(data.generated_at).toLocaleString()} from live taps, questions, captions and scores. Students stay anonymous unless they chose to give their name.
      </p>
    </main>
  );
}

export default function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="min-h-screen bg-paper pb-16 text-ink">
      <div className="print:hidden">
        <Navbar title="ClassCaption" subtitle="Class report" homeHref="/teacher/dashboard" />
      </div>
      <InsightsContent id={id} />
    </div>
  );
}
