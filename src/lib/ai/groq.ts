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

let chatModel: string | null = null;
const PREFERRED = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.1-8b-instant"];

/** Picks a chat model this key can use (Groq retires models over time). */
async function groqChatModel(): Promise<string> {
  if (process.env.GROQ_CHAT_MODEL) return process.env.GROQ_CHAT_MODEL;
  if (chatModel) return chatModel;
  const res = await fetch(`${BASE}/models`, { headers: { authorization: `Bearer ${key()}` }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Groq models ${res.status}`);
  const ids: string[] = ((await res.json()).data ?? []).map((m: { id: string }) => m.id);
  chatModel =
    PREFERRED.find((p) => ids.includes(p)) ??
    ids.find((id) => !/(whisper|guard|tts|playai|distil|compound|orpheus)/i.test(id)) ??
    PREFERRED[0];
  return chatModel;
}

/** JSON chat completion on Groq (used as a fast fallback for translation). */
export async function groqJSON<T>(prompt: string, timeoutMs = 15000): Promise<T> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: await groqChatModel(),
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

let visionModel: string | null = null;

/** Picks a vision-capable chat model on Groq (Llama 4 Scout/Maverick, else a Qwen multimodal model). */
async function groqVisionModel(): Promise<string> {
  if (process.env.GROQ_VISION_MODEL) return process.env.GROQ_VISION_MODEL;
  if (visionModel) return visionModel;
  const res = await fetch(`${BASE}/models`, { headers: { authorization: `Bearer ${key()}` }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Groq models ${res.status}`);
  const ids: string[] = ((await res.json()).data ?? []).map((m: { id: string }) => m.id);
  visionModel =
    ids.find((id) => /llama-4-scout/i.test(id)) ??
    ids.find((id) => /llama-4-maverick/i.test(id)) ??
    ids.find((id) => /vision|vl\b|-vl-/i.test(id)) ??
    ids.find((id) => /qwen/i.test(id)) ??
    "meta-llama/llama-4-scout-17b-16e-instruct";
  return visionModel;
}

/** JSON answer about an image (board capture fallback when Gemini is unavailable). */
export async function groqVisionJSON<T>(prompt: string, image: { mime: string; base64: string }, timeoutMs = 45000): Promise<T> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: await groqVisionModel(),
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.base64}` } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Groq vision ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return parseJSON<T>(data.choices[0].message.content);
}
