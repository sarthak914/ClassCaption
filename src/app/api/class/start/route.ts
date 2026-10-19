import { supabaseAdmin } from "@/lib/supabase/server";
import { body, need, ok, route } from "@/lib/http";
import { newJoinCode } from "@/lib/classes";
import { ownedClassroom } from "@/lib/access";

// POST /api/class/start  { classroomId, title?, sourceLang? }  → teacher goes live in one of their classrooms
export const POST = route(async (req: Request) => {
  const b = await body<{ title?: string; sourceLang?: string; classroomId?: string }>(req);
  const room = await ownedClassroom(need(b.classroomId, "classroomId is required"));
  const db = supabaseAdmin();
  // One live class per classroom: end any that were left running.
  await db.from("classes").update({ status: "ended", ended_at: new Date().toISOString() }).eq("classroom_id", room.id).eq("status", "live");
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db
      .from("classes")
      .insert({
        title: b.title?.trim() || `${room.name} – Live Lecture`,
        source_lang: b.sourceLang || room.default_source_language || "en-IN",
        join_code: newJoinCode(), // internal id; students always join with the classroom PIN
        classroom_id: room.id,
      })
      .select("*, classroom:classrooms(*)")
      .single();
    if (!error) return ok({ class: data, channel: `class:${data.id}` }, 201);
    if (error.code !== "23505") throw error; // retry only on join_code collision
  }
  throw new Error("Could not allocate a join code");
});
