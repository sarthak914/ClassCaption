import { HttpError, ok, route, type Ctx } from "@/lib/http";
import { classForTeacher } from "@/lib/access";
import { publishCaption } from "@/lib/captions";
import { transcribe, type WhisperSegment } from "@/lib/ai/groq";
import { glossaryTerms, speechLang } from "@/lib/languages";
import { rateLimit } from "@/lib/ratelimit";
import { tidySpeech } from "@/lib/speech";

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

/**
 * Only drop what is clearly not speech. Low confidence alone is NOT a reason to drop:
 * strong accents, dialects, stutters and speech differences all lower Whisper's confidence,
 * and the translator (with context) is good at recovering the meaning.
 */
function isSpeech(s: WhisperSegment, quietClip: boolean) {
  const nsp = s.noSpeechProb ?? 0;
  const lp = s.avgLogprob ?? 0;
  if (nsp > 0.85 && lp < -0.8) return false; // Whisper is sure there's no speech
  if (quietClip && lp < -1.0) return false; // faint clip and a guess: noise, not a soft voice (those score well above -1)
  if (lp < -1.3 && nsp > 0.3) return false; // wild guess on probably-empty audio
  if (lp < -1.5) return false; // pure guess (real voices, even heavy accents, score above about -1)
  return !JUNK.some((re) => re.test(s.text.trim()));
}

/** On silence Whisper sometimes just repeats its prompt (the previous caption). */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function echoesPrompt(text: string, prompt: string) {
  const t = norm(text);
  return t.length > 0 && t.length < 80 && norm(prompt).includes(t);
}

const meanLogprob = (segs: WhisperSegment[]) => {
  const w = segs.map((s) => Math.max(0.1, s.end - s.start));
  const total = w.reduce((a, b) => a + b, 0) || 1;
  return segs.reduce((a, s, i) => a + (s.avgLogprob ?? -1) * w[i], 0) / total;
};

/** Whisper continues the style of its prompt, so a sample sentence in the right script keeps the output consistent. */
const STYLE: Record<string, string> = {
  "en-IN": 'Teacher speaks Indian English mixed with Hindi, written in English letters, e.g. "Toh basically, yeh algorithm ka time complexity O(n log n) hai."',
  "hi-IN": "शिक्षक हिंदी में पढ़ा रहे हैं, कभी-कभी भोजपुरी, हरियाणवी या राजस्थानी जैसी बोली में, और English शब्दों के साथ।",
};

/**
 * POST /api/class/:id/transcribe  multipart { audio, seq, targets (JSON), context (JSON), speechMs?, peak? }
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
  const peak = Number(form.get("peak"));
  const quietClip = Number.isFinite(peak) && peak > 0 && peak < 0.012;

  const lang = speechLang(cls.source_lang);
  const glossary = glossaryTerms(cls.classroom?.glossary);
  // Topic words help Whisper spell terms, the last line keeps it on track, and the style sample keeps the script consistent.
  const prompt = [
    `Lecture: ${cls.title}${cls.classroom?.name && cls.classroom.name !== cls.title ? ` (${cls.classroom.name})` : ""}.`,
    glossary.length ? `Key terms: ${glossary.join(", ")}.` : "",
    STYLE[cls.source_lang] ?? "",
    context.at(-1) ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const ext = (audio.type.includes("ogg") && "ogg") || (audio.type.includes("mp4") && "m4a") || (audio.type.includes("wav") && "wav") || "webm";
  const run = (language?: string) => transcribe(audio, `phrase.${ext}`, language, { prompt, timeoutMs: 20000 });

  let r = await run(lang.whisper);
  let segs = r.segments.filter((s) => isSpeech(s, quietClip));
  let retried = false;
  // Very unsure (heavy accent, dialect, mixed language): try once more letting Whisper detect the language,
  // and keep whichever reading it is more confident about.
  if (lang.whisper && segs.length && meanLogprob(segs) < -0.9) {
    try {
      const alt = await run(undefined);
      const altSegs = alt.segments.filter((s) => isSpeech(s, quietClip));
      if (altSegs.length && meanLogprob(altSegs) > meanLogprob(segs) + 0.15) {
        r = alt;
        segs = altSegs;
        retried = true;
      }
    } catch {}
  }

  const raw = r.segments.length ? segs.map((s) => s.text).join(" ") : r.text ?? "";
  const text = tidySpeech(raw);
  const stt_ms = Date.now() - t0;
  if (!text || JUNK.some((re) => re.test(text)) || echoesPrompt(text, prompt)) return ok({ skipped: true, reason: "no speech", stt_ms });

  const { caption, provider, translateError } = await publishCaption(cls, text.slice(0, 2000), { seq, targets, context });
  return ok(
    {
      caption,
      provider,
      stt_ms,
      latency_ms: Date.now() - t0,
      confidence: Number(meanLogprob(segs).toFixed(2)),
      ...(retried ? { retried: "auto-language" } : {}),
      ...(translateError ? { translateError } : {}),
    },
    201,
  );
});
