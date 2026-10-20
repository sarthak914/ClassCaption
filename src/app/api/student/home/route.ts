import { supabaseAdmin } from "@/lib/supabase/server";
import { ok, route } from "@/lib/http";
import { getStudent } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/student/home → only what this device's student pass covers:
 * { student: { name } | null, classrooms: [{ id, name, subject_code, room, teacher, live_class, lecture_count }], lectures: [...] }
 */
export const GET = route(async () => {
  const s = await getStudent();
  if (!s || !s.rooms.length) return ok({ student: s ? { name: s.name } : null, classrooms: [], lectures: [] });
  const db = supabaseAdmin();
  const [{ data: rooms }, { data: live }, { data: lectures }] = await Promise.all([
    db.from("classrooms").select("id,name,subject_code,room,teacher:teachers(name,institution)").in("id", s.rooms),
    db.from("classes").select("id,title,started_at,classroom_id").in("classroom_id", s.rooms).eq("status", "live").order("started_at", { ascending: false }),
    db
      .from("lectures")
      .select("id,title,status,source,duration_s,created_at,classroom_id")
      .in("classroom_id", s.rooms)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  const order = new Map(s.rooms.map((r, i) => [r, i]));
  const classrooms = (rooms ?? [])
    .map((r) => ({
      ...r,
      live_class: (live ?? []).find((c) => c.classroom_id === r.id) ?? null,
      lecture_count: (lectures ?? []).filter((l) => l.classroom_id === r.id).length,
    }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return ok({ student: { name: s.name }, classrooms, lectures: lectures ?? [] });
});
