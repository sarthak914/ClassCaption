import "server-only";
import { supabaseAdmin } from "./supabase/server";
import { HttpError } from "./http";
import { baseLang, sourceIsMixed } from "./languages";
import { translate } from "./translate";

export type ClassRow = {
  id: string;
  title: string;
  join_code: string;
  source_lang: string;
  status: "live" | "ended";
  languages: string[];
  lecture_id: string | null;
  classroom_id: string | null;
  classroom?: ClassroomRow | null;
  started_at: string;
  ended_at: string | null;
};

export type ClassroomRow = {
  id: string;
  name: string;
  subject_code: string | null;
  room: string | null;
  description: string | null;
  join_code: string;
  default_source_language: string;
  created_at: string;
};

export type CaptionRow = {
  id: number;
  class_id: string;
  seq: number;
  text: string;
  translations: Record<string, string>;
  offset_s: number;
  created_at: string;
};

const WITH_CLASSROOM = "*, classroom:classrooms(*)";

export async function getClass(id: string): Promise<ClassRow> {
  const { data, error } = await supabaseAdmin().from("classes").select(WITH_CLASSROOM).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Class not found");
  return data;
}

/**
 * Accepts a live class's own join code, or a classroom PIN (then returns that
 * classroom's current live class).
 */
export async function getClassByCode(code: string): Promise<ClassRow> {
  const db = supabaseAdmin();
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const { data, error } = await db
    .from("classes")
    .select(WITH_CLASSROOM)
    .eq("join_code", clean)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: room } = await db.from("classrooms").select("id,name").eq("join_code", clean).maybeSingle();
  if (!room) throw new HttpError(404, "Invalid classroom PIN. Please check the code on the screen.");
  const { data: live } = await db
    .from("classes")
    .select(WITH_CLASSROOM)
    .eq("classroom_id", room.id)
    .eq("status", "live")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!live) throw new HttpError(409, `${room.name} has no live lecture right now. Ask your teacher to start the class.`);
  return live;
}

export async function listClasses(opts: { status?: string; classroomId?: string; limit?: number } = {}) {
  let q = supabaseAdmin().from("classes").select(WITH_CLASSROOM);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.classroomId) q = q.eq("classroom_id", opts.classroomId);
  const { data, error } = await q.order("started_at", { ascending: false }).limit(opts.limit ?? 20);
  if (error) throw error;
  return data as ClassRow[];
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function newJoinCode(n = 6) {
  return Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
}

/** Captions with a `display` field in `lang`, translating and caching any that lack it. */
export async function captionsIn(cls: ClassRow, lang: string | null, opts: { sinceSeq?: number; limit?: number } = {}) {
  const db = supabaseAdmin();
  let q = db.from("captions").select("*").eq("class_id", cls.id);
  if (opts.sinceSeq !== undefined) q = q.gt("seq", opts.sinceSeq);
  const { data, error } = await q.order("seq", { ascending: false }).limit(opts.limit ?? 50);
  if (error) throw error;
  const caps = (data as CaptionRow[]).reverse();
  const src = baseLang(cls.source_lang);
  if (!lang || (lang === src && !sourceIsMixed(cls.source_lang))) return caps.map((c) => ({ ...c, display: c.text }));

  const missing = caps.filter((c) => !c.translations?.[lang]);
  if (missing.length) {
    try {
      const { result } = await translate(missing.map((c) => c.text), [lang], src, { keepSource: sourceIsMixed(cls.source_lang) });
      await Promise.all(
        missing.map((c, i) => {
          c.translations = { ...(c.translations ?? {}), [lang]: result[lang][i] };
          return db.from("captions").update({ translations: c.translations }).eq("id", c.id);
        }),
      );
    } catch (e) {
      console.error("caption backfill failed:", (e as Error).message);
    }
  }
  return caps.map((c) => ({ ...c, display: c.translations?.[lang] ?? c.text }));
}

export async function addLanguage(cls: ClassRow, lang: string) {
  if (!lang || (cls.languages ?? []).includes(lang)) return cls.languages ?? [];
  const languages = [...(cls.languages ?? []), lang];
  await supabaseAdmin().from("classes").update({ languages }).eq("id", cls.id);
  return languages;
}
