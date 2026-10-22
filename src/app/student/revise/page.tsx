"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Repeat, X } from "lucide-react";
import { Navbar } from "@/components/navigation/Navbar";
import { BottomNav } from "@/components/navigation/BottomNav";
import { ReminderToggle, ROUND_LABEL, whenLabel, type Revisions } from "@/components/revision/RevisionCard";
import { api, pref } from "@/lib/client/api";

type Question = { question: string; options: string[]; answer_index?: number; explanation?: string };
type Round = {
  id: number;
  step: number;
  lang: string;
  lecture: { id: string; title: string; classroom: string | null };
  done: boolean;
  score: number | null;
  answers: number[] | null;
  questions: Question[];
};
type Result = { score: number; total: number; answers: number[]; questions: Question[]; next: { step: number; due_at: string } | null };

function ReviseContent() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const [list, setList] = useState<Revisions | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [sending, setSending] = useState(false);
  const [lang, setLang] = useState("en");

  useEffect(() => setLang(pref("lang", "hi")), []);

  useEffect(() => {
    setRound(null);
    setResult(null);
    setPicked([]);
    setCurrent(0);
    setError("");
    if (!id) {
      api<Revisions>("/api/revisions").then(setList).catch((e) => setError((e as Error).message));
      return;
    }
    api<{ revision: Round }>(`/api/revisions/${id}`)
      .then(({ revision }) => {
        setRound(revision);
        if (revision.done && revision.answers) {
          setResult({ score: revision.score ?? 0, total: revision.questions.length, answers: revision.answers, questions: revision.questions, next: null });
        }
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  const choose = async (i: number) => {
    if (!round || sending) return;
    const next = [...picked];
    next[current] = i;
    setPicked(next);
    if (current < round.questions.length - 1) {
      setTimeout(() => setCurrent(current + 1), 250);
      return;
    }
    setSending(true);
    try {
      setResult(await api<Result>(`/api/revisions/${round.id}`, { json: { answers: next } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  // The list of rounds: due now, coming up, and finished.
  if (!id) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <section>
          <p className="cc-eyebrow mb-1">Spaced revision</p>
          <h1 className="text-3xl font-normal">Revise</h1>
          <p className="text-sm text-ink-2 mt-1">
            Three questions the day after each class, again on day 3 and after a week. Anything you miss comes back next round.
          </p>
        </section>
        {error && <p className="text-sm text-sindoor-deep">{error}</p>}
        {!list && !error && <p className="text-sm text-ink-3">Loading...</p>}
        {list && !list.due.length && !list.upcoming.length && !list.done.length && (
          <p className="rounded-card border border-dashed border-rule-strong cc-kolam text-sm text-ink-3 text-center py-6 px-4">
            Nothing to revise yet. After your next live class, three questions arrive here the following morning.
          </p>
        )}
        {!!list?.due.length && (
          <section className="space-y-2">
            <h2 className="cc-eyebrow">Due now</h2>
            {list.due.map((r) => (
              <Link key={r.id} href={`/student/revise?id=${r.id}`} className="cc-card p-4 flex items-center justify-between gap-3 hover:!border-ink transition">
                <span className="min-w-0">
                  <span className="font-semibold text-ink block truncate">{r.title}</span>
                  <span className="text-xs text-ink-3">{[r.classroom, ROUND_LABEL[r.step]].filter(Boolean).join(" · ")}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-haldi-deep flex-shrink-0" />
              </Link>
            ))}
          </section>
        )}
        {!!list?.upcoming.length && (
          <section className="space-y-2">
            <h2 className="cc-eyebrow">Coming up</h2>
            {list.upcoming.map((r) => (
              <div key={r.id} className="px-4 py-3 rounded-xl border border-rule bg-paper text-sm flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{r.title}</span>
                <span className="text-xs text-ink-3 flex-shrink-0">{whenLabel(r.due_at)}</span>
              </div>
            ))}
          </section>
        )}
        {!!list?.done.length && (
          <section className="space-y-2">
            <h2 className="cc-eyebrow">Finished</h2>
            {list.done.map((r) => (
              <Link key={r.id} href={`/student/revise?id=${r.id}`} className="px-4 py-3 rounded-xl border border-rule bg-paper text-sm flex items-center justify-between gap-3 hover:bg-paper-2">
                <span className="min-w-0 truncate">
                  {r.title} <span className="text-ink-3">· {ROUND_LABEL[r.step]}</span>
                </span>
                <span className="font-mono text-xs font-bold text-patta flex-shrink-0">
                  {r.score}/{r.total}
                </span>
              </Link>
            ))}
          </section>
        )}
        <ReminderToggle lang={lang} compact />
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        <p className="text-sm text-sindoor-deep">{error}</p>
        <Link href="/student/revise" className="text-sm font-bold text-neel underline">All revisions</Link>
      </main>
    );
  }
  if (!round) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-6">
        <section className="cc-board cc-kolam-light p-8 text-center">
          <p className="text-chalk-dim">Picking your three questions...</p>
        </section>
      </main>
    );
  }

  const header = (
    <section>
      <p className="cc-eyebrow mb-1 flex items-center gap-1.5">
        <Repeat className="w-3.5 h-3.5" />
        {ROUND_LABEL[round.step]}
      </p>
      <h1 className="text-2xl sm:text-3xl font-normal leading-tight">{round.lecture.title}</h1>
      {round.lecture.classroom && <p className="text-sm text-ink-3">{round.lecture.classroom}</p>}
    </section>
  );

  // Results: what I got right, and the explanation for each.
  if (result) {
    const perfect = result.score === result.total;
    return (
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5" lang={round.lang}>
        {header}
        <section className={`cc-board p-6 text-center space-y-1`}>
          <p className="font-mono text-4xl text-chalk-yellow">
            {result.score}/{result.total}
          </p>
          <p className="text-chalk-dim text-sm">
            {perfect ? "All correct. It's sticking." : "The ones you missed come back in your next round."}
          </p>
        </section>
        {result.questions.map((q, qi) => {
          const right = result.answers[qi] === q.answer_index;
          return (
            <div key={qi} className="cc-card p-4 space-y-2">
              <p className="font-semibold text-ink flex items-start gap-2">
                {right ? <Check className="w-4 h-4 text-patta mt-1 flex-shrink-0" /> : <X className="w-4 h-4 text-sindoor mt-1 flex-shrink-0" />}
                {q.question}
              </p>
              <p className="text-sm text-ink-2">
                <span className="font-semibold">{q.options[q.answer_index ?? 0]}</span>
                {!right && result.answers[qi] >= 0 && <span className="text-ink-3"> · you picked {q.options[result.answers[qi]]}</span>}
              </p>
              {q.explanation && <p className="text-sm text-ink-3 leading-relaxed">{q.explanation}</p>}
            </div>
          );
        })}
        {result.next && (
          <p className="text-sm text-ink-2 text-center">
            Next round <span className="font-semibold text-ink">{whenLabel(result.next.due_at)}</span>.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/student/lectures/${round.lecture.id}?tab=notes`} className="cc-btn h-11 text-sm">
            Lecture notes
          </Link>
          <button onClick={() => router.push("/student/revise")} className="cc-btn cc-btn-primary h-11 text-sm">
            Done
          </button>
        </div>
      </main>
    );
  }

  // One question at a time.
  const q = round.questions[current];
  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-5" lang={round.lang}>
      {header}
      <div className="flex items-center gap-1.5" aria-label={`Question ${current + 1} of ${round.questions.length}`}>
        {round.questions.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < current ? "bg-patta" : i === current ? "bg-sindoor" : "bg-rule"}`} />
        ))}
      </div>
      <section className="cc-card p-5 space-y-4">
        <p className="text-lg font-medium leading-snug">
          <span className="font-heading italic text-sindoor mr-1.5">{current + 1}.</span>
          {q.question}
        </p>
        <div className="space-y-2">
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={sending}
              className={`w-full text-left px-4 py-3 rounded-[10px] border bg-card transition text-[15px] ${
                picked[current] === i ? "border-neel bg-neel-wash" : "border-rule-strong hover:border-ink"
              }`}
            >
              <span className="font-mono text-xs text-ink-3 mr-2">{String.fromCharCode(65 + i)}</span>
              {opt}
            </button>
          ))}
        </div>
        {current > 0 && (
          <button onClick={() => setCurrent(current - 1)} className="text-xs font-bold text-neel hover:underline">
            Back
          </button>
        )}
        {sending && <p className="text-xs text-ink-3">Checking...</p>}
      </section>
    </main>
  );
}

export default function RevisePage() {
  return (
    <div className="min-h-screen bg-paper pb-28 text-ink">
      <Navbar title="ClassCaption" subtitle="Revision" />
      <Suspense fallback={<div className="p-8 text-center text-sm text-ink-3">Loading...</div>}>
        <ReviseContent />
      </Suspense>
      <BottomNav currentTab="home" />
    </div>
  );
}
