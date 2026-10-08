"use client";

import { Activity } from "lucide-react";

interface PaceGaugeProps {
  wpm: number;
}

export function PaceGauge({ wpm }: PaceGaugeProps) {
  // Determine pace status: Slow (<120), Optimal (120-150), Moderately Fast (150-180), Too Fast (>180)
  let status = "Optimal";
  let statusBadgeColor = "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]";
  let guidance = "Ideal pacing for high-accuracy regional translation.";

  if (wpm < 110) {
    status = "Slow";
    statusBadgeColor = "bg-[#EFF6FF] text-[#1E40AF] border-[#BFDBFE]";
    guidance = "Pace is relaxed; good for complex conceptual breakdowns.";
  } else if (wpm <= 150) {
    status = "Optimal";
    statusBadgeColor = "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]";
    guidance = "Optimal pace for real-time Indic translation accuracy.";
  } else if (wpm <= 180) {
    status = "Moderately Fast";
    statusBadgeColor = "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]";
    guidance = "Slow slightly for better regional translation accuracy.";
  } else {
    status = "Too Fast";
    statusBadgeColor = "bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]";
    guidance = "Speech rate exceeding optimal translation window (>180 WPM).";
  }

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
        <div className={`rounded-l-full ${wpm < 110 ? "bg-[#3B82F6]" : "bg-[#DBEAFE]"}`} />
        <div className={`rounded-none ${wpm >= 110 && wpm <= 150 ? "bg-[#059669]" : "bg-[#D1FAE5]"}`} />
        <div className={`rounded-none ${wpm > 150 && wpm <= 180 ? "bg-[#D97706]" : "bg-[#FEF3C7]"}`} />
        <div className={`rounded-r-full ${wpm > 180 ? "bg-[#DC2626]" : "bg-[#FEE2E2]"}`} />
      </div>

      <div className="flex justify-between text-[11px] font-semibold text-[#64748B] mb-3 px-1">
        <span>Slow</span>
        <span>Optimal</span>
        <span className="text-[#0F172A] font-bold">{wpm} WPM</span>
        <span>Too Fast</span>
      </div>

      <div className="bg-[#F8FAFC] rounded-xl p-3 border border-[#E2E8F0] flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
        <p className="text-xs text-[#475569] font-medium">{guidance}</p>
      </div>
    </div>
  );
}
