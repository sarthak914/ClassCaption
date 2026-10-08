import { supabaseAdmin } from "@/lib/supabase/server";
import { body, HttpError, ok, route } from "@/lib/http";
import { newJoinCode } from "@/lib/classes";

// POST /api/class/start  { title?, sourceLang?, classroomId? }  → teacher goes live
export const POST = route(async (req: Request) => {
  const { title, sourceLang, classroomId } = await body<{ title?: string; sourceLang?: string; classroomId?: string }>(req);
  const db = supabaseAdmin();
  let room: { id: string; name: string; default_source_language: string } | null = null;
  if (classroomId) {
    const { data } = await db.from("classrooms").select("id,name,default_source_language").eq("id", classroomId).maybeSingle();
    if (!data) throw new HttpError(404, "Classroom not found");
    room = data;
    // One live class per classroom: end any that were left running.
    await db.from("classes").update({ status: "ended", ended_at: new Date().toISOString() }).eq("classroom_id", data.id).eq("status", "live");
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db
      .from("classes")
      .insert({
        title: title?.trim() || (room ? `${room.name} – Live Lecture` : "Live class"),
        source_lang: sourceLang || room?.default_source_language || "en-IN",
        join_code: newJoinCode(),
        classroom_id: room?.id ?? null,
      })
      .select("*, classroom:classrooms(*)")
      .single();
    if (!error) return ok({ class: data, channel: `class:${data.id}` }, 201);
    if (error.code !== "23505") throw error; // retry only on join_code collision
  }
  throw new Error("Could not allocate a join code");
});
