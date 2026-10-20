import "server-only";
import { supabaseAdmin } from "./supabase/server";
import { baseLang, sourceIsMixed } from "./languages";
import { translate } from "./translate";
import type { CaptionRow, ClassRow } from "./classes";

/**
 * Translates one spoken line for every language a student reads, then inserts the row;
 * Supabase Realtime pushes it to all students subscribed to the class.
 * Shared by /api/captions (Web Speech text) and /api/class/:id/transcribe (Whisper audio).
 */
export async function publishCaption(
  cls: ClassRow,
  text: string,
  opts: { seq?: number; offsetS?: number; targets?: string[]; context?: string[] } = {},
) {
  const db = supabaseAdmin();
  let seq = opts.seq;
  if (typeof seq !== "number") {
    const { data } = await db.from("captions").select("seq").eq("class_id", cls.id).order("seq", { ascending: false }).limit(1);
    seq = (data?.[0]?.seq ?? -1) + 1;
  }
  const offset_s = Math.max(0, typeof opts.offsetS === "number" ? opts.offsetS : (Date.now() - new Date(cls.started_at).getTime()) / 1000);

  const src = baseLang(cls.source_lang);
  // Hindi is always included so the demo works before any student has joined.
  // en-IN speech is often Hinglish, so English stays a real target (clean English) in that case.
  const targets = [...new Set([...(opts.targets ?? cls.languages), "hi"])].filter((l) => l !== src || sourceIsMixed(cls.source_lang));
  let translations: Record<string, string> = {};
  let provider = "none";
  let translateError: string | undefined;
  try {
    const context = (opts.context ?? []).map((c) => String(c).slice(0, 400)).slice(-3);
    const r = await translate([text], targets, src, { keepSource: sourceIsMixed(cls.source_lang), context });
    provider = r.provider;
    translations = Object.fromEntries(Object.entries(r.result).map(([k, v]) => [k, v[0]]));
  } catch (e) {
    translateError = (e as Error).message; // still deliver the original text
  }

  const { data, error } = await db
    .from("captions")
    .insert({ class_id: cls.id, seq, text, translations, offset_s })
    .select("*")
    .single();
  if (error) throw error;
  return { caption: data as CaptionRow, provider, translateError };
}
