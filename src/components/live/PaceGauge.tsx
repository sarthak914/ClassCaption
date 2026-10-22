"use client";

import { PACE_LABEL, PACE_LIMITS, paceOf } from "@/lib/pace";

interface PaceGaugeProps {
  wpm: number;
}

export function PaceGauge({ wpm }: PaceGaugeProps) {
  const pace = paceOf(wpm);
  const status = PACE_LABEL[pace];
  const { slow, good, fast } = PACE_LIMITS;
  const statusColor = {
    silent: "text-ink-3",
    slow: "text-neel",
    good: "text-patta",
    fast: "text-haldi-deep",
    too_fast: "text-sindoor",
  }[pace];
  const guidance = {
    silent: "Measured from your captions over the last minute.",
    slow: "Relaxed pace; good for complex conceptual breakdowns.",
    good: "Optimal pace for accurate live captions and translation.",
    fast: "Slow down slightly so captions and translations keep up.",
    too_fast: `Over ${fast} WPM: captions and translations will lag behind.`,
  }[pace];

  const zones = [
    { id: "slow", label: `<${slow}`, on: "bg-neel" },
    { id: "good", label: `${slow}–${good}`, on: "bg-patta" },
    { id: "fast", label: `${good}–${fast}`, on: "bg-haldi" },
    { id: "too_fast", label: `>${fast}`, on: "bg-sindoor" },
  ] as const;

  return (
    <div className="cc-card p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <span className="cc-eyebrow">Speaking pace</span>
        <span className={`cc-stamp ${statusColor}`}>{status}</span>
      </div>
      <p className="font-heading text-4xl font-normal leading-none mt-2">
        {wpm} <span className="font-sans text-sm text-ink-3">words per minute</span>
      </p>

      <div className="grid grid-cols-4 gap-1 mt-4">
        {zones.map((z) => (
          <div key={z.id}>
            <div className={`h-2 rounded-full ${pace === z.id ? z.on : "bg-paper-2"}`} />
            <span className={`block text-[11px] mt-1.5 font-mono ${pace === z.id ? "text-ink" : "text-ink-4"}`}>{z.label}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 pt-3 border-t border-rule text-sm text-ink-2">{guidance}</p>
    </div>
  );
}
