import { supabaseAdmin } from "@/lib/supabase/server";
import { body, need, ok, route } from "@/lib/http";
import { newJoinCode } from "@/lib/classes";

/**
 * GET /api/classrooms → classrooms with their current live class and lecture count
 * { classrooms: [{ id, name, subject_code, room, join_code, default_source_language,
 *                  live_class: { id, title, started_at } | null, lecture_count }] }
 */
export const GET = route(async () => {
  const db = supabaseAdmin();
  const { data: rooms, error } = await db.from("classrooms").select("*").order("created_at", { ascending: false });
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

// POST /api/classrooms { name, subject_code?, room?, description?, default_source_language? } → { classroom }
export const POST = route(async (req: Request) => {
  const b = await body<{ name?: string; subject_code?: string; room?: string; description?: string; default_source_language?: string }>(req);
  const name = need(b.name?.trim(), "name is required");
  // The old frontend sent "hinglish"; Web Speech needs a BCP-47 locale.
  const lang = !b.default_source_language || b.default_source_language === "hinglish" ? "en-IN" : b.default_source_language;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabaseAdmin()
      .from("classrooms")
      .insert({ name, subject_code: b.subject_code || null, room: b.room || null, description: b.description || null, join_code: newJoinCode(), default_source_language: lang })
      .select("*")
      .single();
    if (!error) return ok({ classroom: { ...data, live_class: null, lecture_count: 0 } }, 201);
    if (error.code !== "23505") throw error;
  }
  throw new Error("Could not allocate a classroom PIN");
});
