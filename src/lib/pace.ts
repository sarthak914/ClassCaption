/** One pace scale for the API, the teacher's gauge and the lecture hub (words per minute). */
export type Pace = "silent" | "slow" | "good" | "fast" | "too_fast";

export const PACE_LIMITS = { slow: 110, good: 150, fast: 180 } as const;

export function paceOf(wpm: number): Pace {
  if (!wpm) return "silent";
  if (wpm < PACE_LIMITS.slow) return "slow";
  if (wpm <= PACE_LIMITS.good) return "good";
  if (wpm <= PACE_LIMITS.fast) return "fast";
  return "too_fast";
}

export const PACE_LABEL: Record<Pace, string> = {
  silent: "Waiting for speech",
  slow: "Slow",
  good: "Optimal",
  fast: "Moderately Fast",
  too_fast: "Too Fast",
};
