import "server-only";
import { randomBytes } from "node:crypto";
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
  teacher_id: string | null;
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

/** Classroom by its PIN (what students type or scan). */
export async function getClassroomByPin(pin: string): Promise<ClassroomRow> {
  const clean = pin.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const { data, error } = await supabaseAdmin().from("classrooms").select("*").eq("join_code", clean).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Invalid classroom PIN. Please check the code on the screen.");
  return data;
}

/** The classroom's live class, if one is running. */
export async function liveClassOf(classroomId: string): Promise<ClassRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("classes")
    .select(WITH_CLASSROOM)
    .eq("classroom_id", classroomId)
    .eq("status", "live")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
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
  // crypto-random so PINs can't be predicted from earlier ones
  return Array.from(randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join("");
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

/** Every language this class is being read in (plus Hindi and English for the teacher's feeds). */
export function classTargets(cls: ClassRow) {
  const src = baseLang(cls.source_lang);
  return [...new Set([...(cls.languages ?? []), "hi", "en"])].filter((l) => l !== src || sourceIsMixed(cls.source_lang));
}

/** Translate teacher-side texts into every language students are reading. Never throws. */
export async function translateForClass(cls: ClassRow, texts: string[], source?: string): Promise<Record<string, string[]>> {
  const src = source ?? baseLang(cls.source_lang);
  const targets = classTargets(cls).filter((l) => l !== src);
  if (!texts.length || !targets.length) return {};
  try {
    return (await translate(texts, targets, src, { keepSource: sourceIsMixed(cls.source_lang) })).result;
  } catch (e) {
    console.error("event translation failed:", (e as Error).message);
    return {};
  }
}

export type EventKind = "announcement" | "board" | "ended";

/** Server-written live events; students receive them over Realtime (table class_events). */
export async function addEvent(classId: string, kind: EventKind, payload: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin().from("class_events").insert({ class_id: classId, kind, payload }).select("*").single();
  if (error) throw error;
  return data;
}

export async function latestEvents(classId: string) {
  const { data } = await supabaseAdmin()
    .from("class_events")
    .select("*")
    .eq("class_id", classId)
    .in("kind", ["announcement", "board"])
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = data ?? [];
  return { announcement: rows.find((r) => r.kind === "announcement") ?? null, board: rows.find((r) => r.kind === "board") ?? null };
}

/** What a student may see of a class: no PINs or owner ids. */
export function studentView(cls: ClassRow) {
  const { join_code: _j, classroom, ...rest } = cls;
  if (!classroom) return { ...rest, classroom: null };
  const { join_code: _p, teacher_id: _t, ...room } = classroom;
  return { ...rest, classroom: room };
}
