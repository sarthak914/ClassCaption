"use client";

import { AlertTriangle } from "lucide-react";

interface ConfusionMeterProps {
  count: number;
  totalStudents?: number;
  lastSpikeTime?: string;
  topic?: string;
}

export function ConfusionMeter({ count, totalStudents = 0, lastSpikeTime, topic }: ConfusionMeterProps) {
  // Taps in the last minute as a share of the students in the room (taps can't exceed one per student per 10 s).
  const percentage = totalStudents > 0 ? Math.min(100, Math.round((count / totalStudents) * 100)) : count > 0 ? 100 : 0;
  const isHigh = count > 0 && percentage >= 5;

  return (
    <div className="cc-card p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <span className="cc-eyebrow">&ldquo;I&apos;m lost&rdquo; · last minute</span>
        <span className={`cc-stamp ${isHigh ? "text-sindoor" : "text-patta"}`}>{isHigh ? "Slow down" : "Following"}</span>
      </div>
      <p className="font-heading text-4xl font-normal leading-none mt-2">
        {count} <span className="font-sans text-sm text-ink-3">{count === 1 ? "tap" : "taps"} · {totalStudents ? `${percentage}% of ${totalStudents}` : "no students yet"}</span>
      </p>

      {/* Share of the class, scaled so 25% fills the bar; the tick marks the 5% line */}
      <div className="relative w-full bg-paper-2 h-2 rounded-full overflow-hidden mt-4">
        <div
          className={`h-full transition-all duration-500 rounded-full ${isHigh ? "bg-sindoor" : "bg-patta"}`}
          style={{ width: `${Math.min(100, Math.max(count ? 4 : 0, percentage * 4))}%` }}
        />
        <span className="absolute top-0 bottom-0 left-[20%] w-px bg-ink-4" aria-hidden />
      </div>
      <div className="flex justify-between text-[11px] text-ink-3 mt-1.5">
        <span>Alert above 5%</span>
        <span className="font-mono">{percentage}%</span>
      </div>

      {count > 0 && lastSpikeTime && (
        <p className="mt-3 pt-3 border-t border-rule text-sm text-ink-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-sindoor" />
          <span>
            Latest at <span className="font-mono">{lastSpikeTime}</span>
            {topic ? (
              <>
                {" "}during <span className="font-heading italic text-ink">&ldquo;{topic}&rdquo;</span>
              </>
            ) : null}
          </span>
        </p>
      )}
    </div>
  );
}
