import { supabaseAdmin } from "@/lib/supabase/server";
import { body, HttpError, need, ok, route } from "@/lib/http";
import { newJoinCode } from "@/lib/classes";
import { requireTeacher } from "@/lib/auth";
import { glossaryTerms, SPEECH_CODES } from "@/lib/languages";

/**
 * GET /api/classrooms (signed-in teacher) → their classrooms with the current live class and lecture count
 * { classrooms: [{ id, name, subject_code, room, join_code, default_source_language,
 *                  live_class: { id, title, started_at } | null, lecture_count }] }
 */
export const GET = route(async () => {
  const teacher = await requireTeacher();
  const db = supabaseAdmin();
  const { data: rooms, error } = await db.from("classrooms").select("*").eq("teacher_id", teacher.tid).order("created_at", { ascending: false });
  if (error) throw error;
  const ids = (rooms ?? []).map((r) => r.id);
  const [{ data: live }, { data: lecs }] = ids.length
    ? await Promise.all([
        db.from("classes").select("id,title,started_at,classroom_id").in("classroom_id", ids).eq("status", "live").order("started_at", { ascending: false }),
        db.from("lectures").select("id,classroom_id").in("classroom_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const classrooms = (rooms ?? []).map((r) => ({
    ...r,
    live_class: (live ?? []).find((c) => c.classroom_id === r.id) ?? null,
    lecture_count: (lecs ?? []).filter((l) => l.classroom_id === r.id).length,
  }));
  return ok({ classrooms });
});

// POST /api/classrooms { name, subject_code?, room?, description?, default_source_language?, glossary? } → { classroom }
export const POST = route(async (req: Request) => {
  const teacher = await requireTeacher();
  const b = await body<{ name?: string; subject_code?: string; room?: string; description?: string; default_source_language?: string; glossary?: string }>(req);
  const name = need(b.name?.trim().slice(0, 120), "name is required");
  // The old frontend sent "hinglish"; Web Speech needs a BCP-47 locale.
  const lang = !b.default_source_language || b.default_source_language === "hinglish" ? "en-IN" : b.default_source_language;
  if (!SPEECH_CODES.includes(lang)) throw new HttpError(400, "Unsupported speech language");
  const glossary = glossaryTerms(b.glossary).join("\n");
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabaseAdmin()
      .from("classrooms")
      .insert({
        name,
        subject_code: b.subject_code?.trim() || null,
        room: b.room?.trim() || null,
        description: b.description?.trim() || null,
        join_code: newJoinCode(),
        default_source_language: lang,
        teacher_id: teacher.tid,
        ...(glossary ? { glossary } : {}), // only sent when used, so classrooms still work before the v4 schema update
      })
      .select("*")
      .single();
    if (!error) return ok({ classroom: { ...data, live_class: null, lecture_count: 0 } }, 201);
    if (error.code === "PGRST204") throw new HttpError(409, "The word list needs a database update: re-run supabase/schema.sql in Supabase");
    if (error.code !== "23505") throw error;
  }
  throw new Error("Could not allocate a classroom PIN");
});
