import "server-only";
import { parseJSON } from "./gemini";

const BASE = "https://api.groq.com/openai/v1";

function key() {
  const k = process.env.GROQ_API_KEY;
  if (!k) throw new Error("GROQ_API_KEY not set");
  return k;
}

export type WhisperSegment = { start: number; end: number; text: string };

/** Speech-to-text with Whisper large-v3 on Groq. Max 25 MB on the free tier. */
export async function transcribe(file: Blob, filename: string, language?: string) {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  if (language) form.append("language", language);
  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}` },
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Groq Whisper ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const segments: WhisperSegment[] = (data.segments ?? []).map(
    (s: { start: number; end: number; text: string }) => ({ start: s.start, end: s.end, text: s.text.trim() }),
  );
  return { text: data.text as string, language: data.language as string, duration: data.duration as number, segments };
}

/** JSON chat completion on Groq (used as a fast fallback for translation). */
export async function groqJSON<T>(prompt: string, timeoutMs = 15000): Promise<T> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Groq chat ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return parseJSON<T>(data.choices[0].message.content);
}
