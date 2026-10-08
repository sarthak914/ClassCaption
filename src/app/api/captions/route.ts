import { supabaseAdmin } from "@/lib/supabase/server";
import { body, HttpError, need, ok, route } from "@/lib/http";
import { getClass } from "@/lib/classes";
import { baseLang, sourceIsMixed } from "@/lib/languages";
import { translate } from "@/lib/translate";

/**
 * POST /api/captions  { classId, text, seq?, offsetS?, targets? }
 * Called by the teacher's browser once per FINAL Web Speech result.
 * Translates into every language a student picked, then inserts the row;
 * Supabase Realtime pushes it to all students subscribed to the class.
 */
export const POST = route(async (req: Request) => {
  const t0 = Date.now();
  const b = await body<{ classId?: string; text?: string; seq?: number; offsetS?: number; targets?: string[] }>(req);
  const classId = need(b.classId, "classId is required");
  const text = need(b.text?.trim(), "text is required");
  const cls = await getClass(classId);
  if (cls.status !== "live") throw new HttpError(409, "Class has ended");

  const db = supabaseAdmin();
  let seq = b.seq;
  if (typeof seq !== "number") {
    const { data } = await db.from("captions").select("seq").eq("class_id", classId).order("seq", { ascending: false }).limit(1);
    seq = (data?.[0]?.seq ?? -1) + 1;
  }
  const offset_s = Math.max(0, typeof b.offsetS === "number" ? b.offsetS : (Date.now() - new Date(cls.started_at).getTime()) / 1000);

  const src = baseLang(cls.source_lang);
  // Hindi is always included so the demo works before any student has joined.
  // en-IN speech is often Hinglish, so English stays a real target (clean English) in that case.
  const targets = [...new Set([...(b.targets ?? cls.languages), "hi"])].filter((l) => l !== src || sourceIsMixed(cls.source_lang));
  let translations: Record<string, string> = {};
  let provider = "none";
  let translateError: string | undefined;
  try {
    const r = await translate([text], targets, src);
    provider = r.provider;
    translations = Object.fromEntries(Object.entries(r.result).map(([k, v]) => [k, v[0]]));
  } catch (e) {
    translateError = (e as Error).message; // still deliver the original text
  }

  const { data, error } = await db
    .from("captions")
    .insert({ class_id: classId, seq, text, translations, offset_s })
    .select("*")
    .single();
  if (error) throw error;
  return ok({ caption: data, provider, latency_ms: Date.now() - t0, ...(translateError ? { translateError } : {}) }, 201);
});
