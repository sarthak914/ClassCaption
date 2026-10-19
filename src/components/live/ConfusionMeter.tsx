"use client";

import { HelpCircle, AlertTriangle } from "lucide-react";

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
    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#FEF3C7] flex items-center justify-center text-[#D97706]">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#475569] block">
              &ldquo;I&apos;m Lost&rdquo; taps (last minute)
            </span>
            <span className="text-2xl font-extrabold text-[#0F172A] font-heading">
              {count} {count === 1 ? "tap" : "taps"} <span className="text-sm font-semibold text-[#64748B]">({totalStudents ? `${percentage}% of ${totalStudents}` : "no students yet"})</span>
            </span>
          </div>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-xs font-bold border ${
            isHigh
              ? "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA] animate-pulse"
              : "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]"
          }`}
        >
          {isHigh ? "Attention Needed" : "Normal Comprehension"}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-[#E2E8F0] h-2.5 rounded-full overflow-hidden my-3">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            isHigh ? "bg-[#DC2626]" : "bg-[#059669]"
          }`}
          style={{ width: `${Math.min(100, Math.max(4, percentage * 4))}%` }}
        />
      </div>

      <div className="flex justify-between text-[11px] font-semibold text-[#64748B] mb-3">
        <span>Threshold: &lt;5%</span>
        <span>Current: {percentage}%</span>
      </div>

      {/* Spike Alert Banner matching Stitch */}
      {count > 0 && lastSpikeTime && (
        <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-3 flex items-center gap-2 text-[#991B1B]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[#DC2626]" />
          <p className="text-xs font-semibold">
            Latest at {lastSpikeTime}
            {topic ? (
              <>
                {" "}during <span className="underline font-bold">{topic}</span>
              </>
            ) : null}
          </p>
        </div>
      )}
    </div>
  );
}
