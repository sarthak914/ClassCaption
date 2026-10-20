import { HttpError, ok, route, type Ctx } from "@/lib/http";
import { classForTeacher } from "@/lib/access";
import { publishCaption } from "@/lib/captions";
import { transcribe, type WhisperSegment } from "@/lib/ai/groq";
import { baseLang } from "@/lib/languages";
import { rateLimit } from "@/lib/ratelimit";

/** Whisper's stock hallucinations on silence / noise (it was trained on subtitled videos). */
const JUNK = [
  /thank(s| you) (so much )?for watching/i,
  /please (like|subscribe)/i,
  /\bsubscribe\b/i,
  /like (and|&) subscribe/i,
  /subtitles? (by|from)/i,
  /amara\.org/i,
  /^(you|bye|thank you|thanks)[.!]*$/i,
  /^[\s.,!?♪-]*$/,
];

function keep(s: WhisperSegment) {
  if ((s.noSpeechProb ?? 0) > 0.6 && (s.avgLogprob ?? 0) < -0.7) return false; // mostly silence
  if ((s.avgLogprob ?? 0) < -1.1) return false; // Whisper unsure: probably noise
  if ((s.compressionRatio ?? 0) > 2.4) return false; // looping / repeated text
  return !JUNK.some((re) => re.test(s.text.trim()));
}

/**
 * POST /api/class/:id/transcribe  multipart { audio, seq, targets (JSON), context (JSON) }
 * The teacher's browser cuts the mic into phrases at natural pauses and sends each one here.
 * Whisper large-v3 (Groq) transcribes it, then it goes through the same caption pipeline as /api/captions.
 * Returns { skipped: true } when the clip had no real speech.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const t0 = Date.now();
  const { id } = await params;
  const { cls, teacher } = await classForTeacher(id);
  if (cls.status !== "live") throw new HttpError(409, "Class has ended");
  rateLimit(`transcribe:${teacher.tid}`, 90, 60);
  if (!process.env.GROQ_API_KEY) throw new HttpError(501, "GROQ_API_KEY not set");

  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Body must be multipart form data");
  });
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size < 1000) return ok({ skipped: true, reason: "empty clip" });
  if (audio.size > 5_000_000) throw new HttpError(413, "Audio clip too large");
  const json = <T,>(k: string, fallback: T): T => {
    try {
      return JSON.parse(String(form.get(k) ?? "")) as T;
    } catch {
      return fallback;
    }
  };
  const seqRaw = Number(form.get("seq"));
  const seq = Number.isFinite(seqRaw) ? seqRaw : undefined;
  const targets = json<string[] | undefined>("targets", undefined);
  const context = json<string[]>("context", []).filter((c) => typeof c === "string").slice(-3);

  const src = baseLang(cls.source_lang);
  const hinglish = cls.source_lang === "en-IN";
  // Whisper continues the style of its prompt: topic words help it spell terms, the last line keeps it on track,
  // and a romanised Hinglish sample stops it from switching to Devanagari/Urdu script mid-lecture.
  const prompt = [
    `Lecture: ${cls.title}${cls.classroom?.name && cls.classroom.name !== cls.title ? ` (${cls.classroom.name})` : ""}.`,
    hinglish ? "Teacher speaks Indian English mixed with Hindi, written in English letters, e.g. \"Toh basically, yeh algorithm ka time complexity O(n log n) hai.\"" : "",
    context.at(-1) ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const ext = (audio.type.includes("ogg") && "ogg") || (audio.type.includes("mp4") && "m4a") || (audio.type.includes("wav") && "wav") || "webm";
  const r = await transcribe(audio, `phrase.${ext}`, src === "hi" ? "hi" : "en", { prompt, timeoutMs: 20000 });
  const text = (r.segments.length ? r.segments.filter(keep).map((s) => s.text).join(" ") : r.text ?? "").replace(/\s+/g, " ").trim();
  const stt_ms = Date.now() - t0;
  if (!text || JUNK.some((re) => re.test(text))) return ok({ skipped: true, reason: "no speech", stt_ms });

  const { caption, provider, translateError } = await publishCaption(cls, text.slice(0, 2000), { seq, targets, context });
  return ok({ caption, provider, stt_ms, latency_ms: Date.now() - t0, ...(translateError ? { translateError } : {}) }, 201);
});
