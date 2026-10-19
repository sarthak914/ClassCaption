"use client";

import { Activity } from "lucide-react";
import { PACE_LABEL, PACE_LIMITS, paceOf } from "@/lib/pace";

interface PaceGaugeProps {
  wpm: number;
}

export function PaceGauge({ wpm }: PaceGaugeProps) {
  const pace = paceOf(wpm);
  const status = PACE_LABEL[pace];
  const { slow, good, fast } = PACE_LIMITS;
  const statusBadgeColor = {
    silent: "bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]",
    slow: "bg-[#EFF6FF] text-[#1E40AF] border-[#BFDBFE]",
    good: "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]",
    fast: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]",
    too_fast: "bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]",
  }[pace];
  const guidance = {
    silent: "Measured from your captions over the last minute.",
    slow: "Relaxed pace; good for complex conceptual breakdowns.",
    good: "Optimal pace for accurate live captions and translation.",
    fast: "Slow down slightly so captions and translations keep up.",
    too_fast: `Over ${fast} WPM: captions and translations will lag behind.`,
  }[pace];

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#ECFDF5] flex items-center justify-center text-[#059669]">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#475569] block">
              Speech Pace Coach
            </span>
            <span className="text-2xl font-extrabold text-[#0F172A] font-heading">
              {wpm} <span className="text-sm font-semibold text-[#64748B]">WPM</span>
            </span>
          </div>
        </div>

        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusBadgeColor}`}>
          {status}
        </span>
      </div>

      {/* Multi-segment pace gauge bar matching Stitch */}
      <div className="grid grid-cols-4 gap-1.5 h-3 my-3">
        <div className={`rounded-l-full ${pace === "slow" ? "bg-[#3B82F6]" : "bg-[#DBEAFE]"}`} />
        <div className={`rounded-none ${pace === "good" ? "bg-[#059669]" : "bg-[#D1FAE5]"}`} />
        <div className={`rounded-none ${pace === "fast" ? "bg-[#D97706]" : "bg-[#FEF3C7]"}`} />
        <div className={`rounded-r-full ${pace === "too_fast" ? "bg-[#DC2626]" : "bg-[#FEE2E2]"}`} />
      </div>

      <div className="flex justify-between text-[11px] font-semibold text-[#64748B] mb-3 px-1">
        <span>&lt;{slow}</span>
        <span>{slow}–{good}</span>
        <span>{good}–{fast}</span>
        <span>&gt;{fast}</span>
      </div>

      <div className="bg-[#F8FAFC] rounded-xl p-3 border border-[#E2E8F0] flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
        <p className="text-xs text-[#475569] font-medium">{guidance}</p>
      </div>
    </div>
  );
}
