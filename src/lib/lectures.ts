import "server-only";
import { supabaseAdmin, LECTURE_BUCKET } from "./supabase/server";
import { transcribe } from "./ai/groq";
import { generateNotes, type Notes, type Seg } from "./ai/lecture";
import { translateMany } from "./translate";
import { HttpError } from "./http";

export type SegmentRow = Seg & { translations: Record<string, string> };

export async function getLecture(id: string) {
  const { data, error } = await supabaseAdmin().from("lectures").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Lecture not found");
  return data;
}

export async function getSegments(lectureId: string): Promise<SegmentRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("segments")
    .select("idx,start_s,end_s,text,translations")
    .eq("lecture_id", lectureId)
    .order("idx");
  if (error) throw error;
  return data as SegmentRow[];
}

async function setStatus(id: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin().from("lectures").update(patch).eq("id", id);
  if (error) throw error;
}

/** Uploaded media → Groq Whisper → segments → Gemini notes. */
export async function processUpload(id: string, language?: string) {
  const db = supabaseAdmin();
  const lec = await getLecture(id);
  if (!lec.audio_path) throw new HttpError(400, "Lecture has no uploaded file");
  try {
    await setStatus(id, { status: "transcribing", progress: 10, error: null });
    const { data: file, error } = await db.storage.from(LECTURE_BUCKET).download(lec.audio_path);
    if (error || !file) throw new Error(`Download failed: ${error?.message ?? "no file"}. Did the upload finish?`);
    if (file.size > 25 * 1024 * 1024) throw new Error("File is over 25 MB (Groq free-tier limit). Upload compressed audio instead.");

    const tr = await transcribe(file, lec.audio_path.split("/").pop() || "audio.mp3", language);
    const segs = tr.segments.map((s, idx) => ({ lecture_id: id, idx, start_s: s.start, end_s: s.end, text: s.text }));
    await db.from("segments").delete().eq("lecture_id", id);
    if (segs.length) {
      const { error: insErr } = await db.from("segments").insert(segs);
      if (insErr) throw insErr;
    }
    await setStatus(id, { status: "summarising", progress: 60, duration_s: tr.duration });

    const notes = segs.length ? await generateNotes(segs) : null;
    await setStatus(id, {
      status: "ready",
      progress: 100,
      notes: notes ? { en: notes } : {},
      title: lec.title || notes?.title || "Untitled lecture",
    });
    return { segments: segs.length, duration_s: tr.duration, language: tr.language };
  } catch (e) {
    await setStatus(id, { status: "failed", error: (e as Error).message });
    throw e;
  }
}

/** Ended live class → lecture. Captions already have text + timestamps, so Whisper is skipped. */
export async function saveClassAsLecture(classId: string) {
  const db = supabaseAdmin();
  const { data: cls, error } = await db.from("classes").select("*").eq("id", classId).maybeSingle();
  if (error) throw error;
  if (!cls) throw new HttpError(404, "Class not found");
  if (cls.lecture_id) return cls.lecture_id as string;

  const [{ data: caps }, { data: reacts }] = await Promise.all([
    db.from("captions").select("seq,text,translations,offset_s").eq("class_id", classId).order("seq"),
    db.from("reactions").select("kind,caption_seq,offset_s").eq("class_id", classId).eq("kind", "lost"),
  ]);
  const captions = caps ?? [];

  const confusionMap = new Map<number, { seq: number; offset_s: number; count: number; text: string }>();
  for (const r of reacts ?? []) {
    const seq = r.caption_seq ?? -1;
    const cap = captions.find((c) => c.seq === seq);
    const cur = confusionMap.get(seq) ?? { seq, offset_s: cap?.offset_s ?? r.offset_s, count: 0, text: cap?.text ?? "" };
    cur.count++;
    confusionMap.set(seq, cur);
  }

  const duration = captions.length ? captions[captions.length - 1].offset_s + 3 : 0;
  const { data: lec, error: lErr } = await db
    .from("lectures")
    .insert({
      class_id: classId,
      title: cls.title,
      source: "live",
      status: captions.length ? "summarising" : "ready",
      progress: captions.length ? 60 : 100,
      duration_s: duration,
      confusion: [...confusionMap.values()].sort((a, b) => a.offset_s - b.offset_s),
    })
    .select("id")
    .single();
  if (lErr) throw lErr;

  if (captions.length) {
    const segs = captions.map((c, i) => ({
      lecture_id: lec.id,
      idx: i,
      start_s: c.offset_s,
      end_s: captions[i + 1]?.offset_s ?? c.offset_s + 3,
      text: c.text,
      translations: c.translations ?? {},
    }));
    const { error: sErr } = await db.from("segments").insert(segs);
    if (sErr) throw sErr;
  }
  await db.from("classes").update({ lecture_id: lec.id }).eq("id", classId);
  return lec.id as string;
}

/** Generates English notes for a lecture that has segments but no notes yet. */
export async function finishLiveLecture(lectureId: string) {
  try {
    const segs = await getSegments(lectureId);
    if (!segs.length) return;
    const notes = await generateNotes(segs);
    await setStatus(lectureId, { status: "ready", progress: 100, notes: { en: notes } });
  } catch (e) {
    await setStatus(lectureId, { status: "failed", error: `Notes failed: ${(e as Error).message}` });
  }
}

/** Notes in a language, generated on first request and cached in lectures.notes. */
export async function notesIn(lectureId: string, lang: string): Promise<Notes> {
  const lec = await getLecture(lectureId);
  if (lec.notes?.[lang]) return lec.notes[lang];
  const segs = await getSegments(lectureId);
  if (!segs.length) throw new HttpError(409, `Lecture is not ready yet (status: ${lec.status})`);
  const notes = await generateNotes(segs, lang);
  const fresh = await getLecture(lectureId);
  await setStatus(lectureId, { notes: { ...(fresh.notes ?? {}), [lang]: notes } });
  return notes;
}

/** Segments with `lang` filled in, translating and caching any that are missing. */
export async function segmentsIn(lectureId: string, lang: string, sourceLang = "en") {
  const segs = await getSegments(lectureId);
  if (lang === sourceLang) return segs.map((s) => ({ ...s, out: s.text }));
  const missing = segs.filter((s) => !s.translations?.[lang]);
  if (missing.length) {
    const translated = await translateMany(missing.map((s) => s.text), lang, sourceLang);
    const db = supabaseAdmin();
    await Promise.all(
      missing.map((s, i) => {
        s.translations = { ...(s.translations ?? {}), [lang]: translated[i] };
        return db.from("segments").update({ translations: s.translations }).eq("lecture_id", lectureId).eq("idx", s.idx);
      }),
    );
  }
  return segs.map((s) => ({ ...s, out: s.translations[lang] ?? s.text }));
}

export function toVTT(cues: { start_s: number; end_s: number; out: string }[]) {
  const ts = (s: number) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
  };
  return "WEBVTT\n\n" + cues.map((c, i) => `${i + 1}\n${ts(c.start_s)} --> ${ts(Math.max(c.end_s, c.start_s + 0.5))}\n${c.out}\n`).join("\n");
}
