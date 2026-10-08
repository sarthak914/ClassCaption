import "server-only";
import { supabaseAdmin } from "./supabase/server";
import { HttpError } from "./http";
import { baseLang } from "./languages";
import { translate } from "./translate";

export type ClassRow = {
  id: string;
  title: string;
  join_code: string;
  source_lang: string;
  status: "live" | "ended";
  languages: string[];
  lecture_id: string | null;
  started_at: string;
  ended_at: string | null;
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

export async function getClass(id: string): Promise<ClassRow> {
  const { data, error } = await supabaseAdmin().from("classes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Class not found");
  return data;
}

export async function getClassByCode(code: string): Promise<ClassRow> {
  const { data, error } = await supabaseAdmin()
    .from("classes")
    .select("*")
    .eq("join_code", code.trim().toUpperCase())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "No class with that code");
  return data;
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
  if (!lang || lang === src) return caps.map((c) => ({ ...c, display: c.text }));

  const missing = caps.filter((c) => !c.translations?.[lang]);
  if (missing.length) {
    try {
      const { result } = await translate(missing.map((c) => c.text), [lang], src);
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
  if (!lang || cls.languages.includes(lang)) return cls.languages;
  const languages = [...cls.languages, lang];
  await supabaseAdmin().from("classes").update({ languages }).eq("id", cls.id);
  return languages;
}
