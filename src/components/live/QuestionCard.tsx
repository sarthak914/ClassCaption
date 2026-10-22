"use client";

import { useState } from "react";
import { Check, Languages, MessageSquareReply, Send, Volume2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { langName } from "@/lib/languages";

export interface QuestionItem {
  id: string;
  studentName: string;
  seat?: string;
  kind: "question" | "speak";
  /** In the class language (what the teacher reads). */
  text: string;
  /** What the student actually typed, and its language, when that differs from `text`. */
  original?: { text: string; lang: string };
  timeAgo: string;
  createdAt: number;
  upvotes?: number;
  resolved: boolean;
  answer?: string;
}

/**
 * One student question in the teacher's queue. A question typed in another language shows the class-language
 * version with the original underneath; "Answer" sends a typed reply back in the asker's language
 * (and to everyone else in theirs).
 */
export function QuestionCard({
  q,
  classId,
  onPlay,
  onResolve,
  onAnswered,
}: {
  q: QuestionItem;
  classId: string;
  onPlay: (text: string) => void;
  onResolve: () => void;
  onAnswered: (answer: string) => void;
}) {
  const [answering, setAnswering] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      await api(`/api/class/${classId}/answer`, { json: { questionId: Number(q.id), text } });
      onAnswered(text);
      setAnswering(false);
      setDraft("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const askedIn = q.original ? langName(q.original.lang) : null;

  return (
    <div className={`cc-card p-5 ${q.kind === "speak" ? "!border-neel-line border-l-4 !border-l-neel" : q.answer ? "border-l-4 !border-l-patta" : ""}`}>
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-paper-2 border border-rule-strong text-ink flex items-center justify-center font-heading text-sm flex-shrink-0">
            {q.studentName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-sm text-ink block truncate">{q.studentName}</span>
            <span className="text-[11px] text-ink-3">
              {q.seat ? `${q.seat} · ` : ""}
              {q.timeAgo}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {askedIn && (
            <span className="cc-stamp text-haldi-deep" title={`Asked in ${askedIn}, translated for you`}>
              <Languages className="w-3 h-3" />
              {askedIn}
            </span>
          )}
          {q.kind === "speak" ? (
            <span className="cc-stamp text-neel">
              <Volume2 className="w-3 h-3" />
              Speak for me
            </span>
          ) : q.answer ? (
            <span className="cc-stamp text-patta">
              <Check className="w-3 h-3" />
              Answered
            </span>
          ) : (
            <span className="cc-stamp text-ink-3">Question</span>
          )}
        </div>
      </div>

      <p className="font-heading text-xl leading-snug">&ldquo;{q.text}&rdquo;</p>
      {q.original && (
        <p lang={q.original.lang} className="text-sm text-ink-3 mt-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] mr-1.5">Original</span>
          {q.original.text}
        </p>
      )}

      {q.answer && (
        <div className="mt-3 border-l-2 border-patta-line pl-3">
          <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-patta">Your answer{askedIn ? `, sent in ${askedIn}` : ""}</span>
          <p className="text-[15px] text-ink-2 leading-relaxed">{q.answer}</p>
        </div>
      )}

      {answering && (
        <form onSubmit={send} className="mt-4 space-y-2">
          <label htmlFor={`answer-${q.id}`} className="sr-only">Your answer</label>
          <textarea
            id={`answer-${q.id}`}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError("");
            }}
            rows={3}
            maxLength={1000}
            autoFocus
            placeholder="Type your answer. It goes back in the student's language."
            className="cc-input w-full p-3 text-[15px] resize-none"
          />
          <p className="text-[11px] text-ink-3">
            {askedIn ? `The student reads it in ${askedIn}. ` : ""}Every other student sees the question and answer in their own language. Answering out loud works too: it is captioned.
          </p>
          {error && <p role="alert" className="text-xs font-semibold text-sindoor-deep">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAnswering(false)} className="cc-btn h-10 px-4 text-xs">
              Cancel
            </button>
            <button type="submit" disabled={sending || !draft.trim()} className="cc-btn cc-btn-primary h-10 px-4 text-xs">
              <Send className="w-4 h-4" />
              {sending ? "Translating..." : "Send answer"}
            </button>
          </div>
        </form>
      )}

      {!answering && (
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button onClick={() => onPlay(q.text)} className="cc-btn cc-btn-primary h-10 px-4 text-xs">
            <Volume2 className="w-4 h-4" />
            <span>Play on classroom speakers</span>
          </button>
          {q.kind === "question" && (
            <button onClick={() => setAnswering(true)} className="cc-btn h-10 px-4 text-xs">
              <MessageSquareReply className="w-4 h-4 text-neel" />
              <span>{q.answer ? "Answer again" : "Answer"}</span>
            </button>
          )}
          <button onClick={onResolve} className="cc-btn h-10 px-4 text-xs">
            <Check className="w-4 h-4 text-patta" />
            <span>Mark resolved</span>
          </button>
        </div>
      )}
    </div>
  );
}
