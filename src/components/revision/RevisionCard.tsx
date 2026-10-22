"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, BellOff, Repeat } from "lucide-react";
import { api } from "@/lib/client/api";
import { disableReminders, enableReminders, pushSupported, remindersOn } from "@/lib/client/push";

export type RevisionItem = {
  id: number;
  lecture_id: string;
  title: string;
  classroom: string | null;
  lang: string;
  step: number;
  due_at: string;
  done_at: string | null;
  score: number | null;
  total: number | null;
};
export type Revisions = { due: RevisionItem[]; upcoming: RevisionItem[]; done: RevisionItem[] };

export const ROUND_LABEL: Record<number, string> = { 1: "Next-day revision", 2: "Day 3 revision", 3: "Week revision" };

/** "tomorrow, 9:00 am" / "Thu, 9:00 am" */
export function whenLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days <= 0) return `today, ${time}`;
  if (days === 1) return `tomorrow, ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

/** Turn browser reminders on or off for revision rounds. Hidden where the browser can't do push. */
export function ReminderToggle({ lang, compact = false }: { lang: string; compact?: boolean }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(pushSupported());
    remindersOn().then(setOn).catch(() => setOn(false));
  }, []);

  if (!supported || on === null) return null;
  const toggle = async () => {
    setBusy(true);
    setMsg("");
    try {
      if (on) await disableReminders();
      else await enableReminders(lang);
      setOn(!on);
      if (!on) setMsg("Reminders on. We'll ping this phone when a revision is ready.");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={compact ? "" : "pt-3 border-t border-rule"}>
      <button onClick={toggle} disabled={busy} className="text-xs font-bold text-neel hover:underline inline-flex items-center gap-1.5">
        {on ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
        {busy ? "One moment..." : on ? "Turn off revision reminders" : "Remind me on this phone"}
      </button>
      {msg && <p className="text-[11px] text-ink-3 mt-1">{msg}</p>}
    </div>
  );
}

/** Home screen card: revision rounds due today, or when the next one comes. Hidden when there is none. */
export function RevisionCard({ lang }: { lang: string }) {
  const [rev, setRev] = useState<Revisions | null>(null);
  useEffect(() => {
    api<Revisions>("/api/revisions").then(setRev).catch(() => {});
  }, []);
  if (!rev || (!rev.due.length && !rev.upcoming.length)) return null;
  const next = rev.upcoming[0];

  if (rev.due.length) {
    const first = rev.due[0];
    return (
      <section className="cc-card !border-haldi-line p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="cc-stamp text-haldi-deep">
            <Repeat className="w-3 h-3" />
            Revision due
          </span>
          <span className="font-mono text-xs text-ink-3">{rev.due.length * 3} questions · about a minute each</span>
        </div>
        <div>
          <h2 className="text-xl font-medium leading-snug">{first.title}</h2>
          <p className="text-xs text-ink-3">
            {[first.classroom, ROUND_LABEL[first.step]].filter(Boolean).join(" · ")}
            {rev.due.length > 1 ? ` · and ${rev.due.length - 1} more` : ""}
          </p>
        </div>
        <p className="text-sm text-ink-2">Three quick questions from class, in your language. Answering them now is what makes it stick.</p>
        <Link href={`/student/revise?id=${first.id}`} className="cc-btn cc-btn-haldi w-full h-12 text-sm">
          Start revision
          <ArrowRight className="w-4 h-4" />
        </Link>
        <ReminderToggle lang={lang} />
      </section>
    );
  }
  return (
    <section className="rounded-card border border-dashed border-rule-strong px-5 py-4 space-y-2">
      <p className="text-sm text-ink-2 flex items-start gap-2">
        <Repeat className="w-4 h-4 text-neel mt-0.5 flex-shrink-0" />
        <span>
          Next revision <span className="font-semibold text-ink">{whenLabel(next.due_at)}</span>: 3 questions from {next.title}.
        </span>
      </p>
      <ReminderToggle lang={lang} compact />
    </section>
  );
}
