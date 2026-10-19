import "server-only";
import { HttpError } from "./http";
import { llmJSON } from "./ai/llm";
import { hasFoulLanguage } from "./profanity";

/**
 * Keeps abusive text out of the class: student questions, "Speak for me" (which the
 * teacher laptop reads aloud) and student names (also read aloud).
 *
 * 1. The word filter in profanity.ts (English + Hindi/Hinglish, Latin and Devanagari).
 * 2. When the words pass and an AI key is set, a quick AI check for abuse the list can't
 *    know (insults, harassment, sexual remarks). It fails open to the word filter, so a slow
 *    or missing AI never stops a real question.
 * Repeat offenders are muted for a while, and the teacher sees who tried.
 */

/** Word filter, then (if it passes and an AI key exists) a short AI check. */
export async function isInappropriate(text: string, opts: { ai?: boolean } = {}): Promise<boolean> {
  if (hasFoulLanguage(text)) return true;
  const aiOn = opts.ai !== false && process.env.MODERATION_AI !== "off" && (process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);
  if (!aiOn) return false;
  try {
    const r = await llmJSON<{ inappropriate?: boolean }>(
      `You moderate messages that students send during a live college lecture. The teacher's laptop may read them aloud to the whole class.
Mark inappropriate ONLY if the message contains profanity or slurs (in any language or script, including Hinglish), sexual remarks, insults or harassment aimed at someone, threats, or hate speech.
Normal academic questions are fine, including ones about biology, medicine, history, violence or crime as subjects. Rudeness alone ("this is boring", "please repeat") is fine.
Reply with JSON only: {"inappropriate": true|false}
Message: """${text.slice(0, 500).replace(/"""/g, "'")}"""`,
      4000,
    );
    return r?.inappropriate === true;
  } catch {
    return false; // AI unavailable: the word filter already passed
  }
}

// ---- Strikes: three blocked messages in 10 minutes mute that student's typing for 10 minutes ----

const STRIKES = 3;
const STRIKE_WINDOW_MS = 10 * 60 * 1000;
const MUTE_MS = 10 * 60 * 1000;
const strikes = new Map<string, number[]>();
const muted = new Map<string, number>();
type Blocked = { name: string; kind: string; at: string };
const blockedLog = new Map<string, Blocked[]>();

export function assertNotMuted(classId: string, sid: string) {
  const until = muted.get(`${classId}:${sid}`) ?? 0;
  if (until > Date.now()) {
    const mins = Math.ceil((until - Date.now()) / 60000);
    throw new HttpError(429, `You've been muted for sending inappropriate messages. You can type again in ${mins} min.`);
  }
}

/** Records a blocked message and throws the error the student sees. */
export function rejectMessage(classId: string, sid: string, name: string, kind: string): never {
  const key = `${classId}:${sid}`;
  const now = Date.now();
  const list = (strikes.get(key) ?? []).filter((t) => t > now - STRIKE_WINDOW_MS);
  list.push(now);
  strikes.set(key, list);
  const log = blockedLog.get(classId) ?? [];
  log.unshift({ name, kind, at: new Date(now).toISOString() });
  blockedLog.set(classId, log.slice(0, 50));
  if (list.length >= STRIKES) {
    muted.set(key, now + MUTE_MS);
    strikes.delete(key);
    throw new HttpError(422, "That message wasn't sent because it isn't appropriate for class. You've been muted for 10 minutes, and your teacher can see this.");
  }
  const left = STRIKES - list.length;
  throw new HttpError(422, `That message wasn't sent because it isn't appropriate for class. Please keep it respectful (${left} more and you'll be muted).`);
}

/** What the teacher sees: how many messages were blocked, from whom, and who is muted right now. */
export function blockedFor(classId: string) {
  const log = blockedLog.get(classId) ?? [];
  const by = new Map<string, number>();
  for (const b of log) by.set(b.name, (by.get(b.name) ?? 0) + 1);
  return { count: log.length, students: [...by].map(([name, count]) => ({ name, count })), last_at: log[0]?.at ?? null };
}
