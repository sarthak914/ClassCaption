"use client";

import { useState } from "react";
import { Repeat } from "lucide-react";
import { api } from "@/lib/client/api";
import { whenLabel } from "./RevisionCard";

/** "Revise this tomorrow": schedules spaced revision of a lecture (day 1, 3, 7) in the student's language. */
export function RemindMeButton({ lectureId, lang }: { lectureId: string; lang: string }) {
  const [due, setDue] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const schedule = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ due_at: string }>(`/api/lectures/${lectureId}/revision`, { json: { lang } });
      setDue(r.due_at);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc-card p-5 flex items-start gap-3">
      <Repeat className="w-5 h-5 text-haldi-deep mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h3 className="text-base font-medium">Revise this tomorrow</h3>
          <p className="text-xs text-ink-3">3 questions tomorrow morning, again on day 3 and after a week. Students who were in the live class get this automatically.</p>
        </div>
        {due ? (
          <p className="text-xs font-semibold text-patta-deep">Scheduled. First round {whenLabel(due)}.</p>
        ) : (
          <button onClick={schedule} disabled={busy} className="cc-btn cc-btn-haldi h-9 px-4 text-xs">
            {busy ? "Scheduling..." : "Schedule revision"}
          </button>
        )}
        {error && <p className="text-xs text-sindoor-deep">{error}</p>}
      </div>
    </div>
  );
}
