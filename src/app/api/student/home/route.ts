import { supabaseAdmin } from "@/lib/supabase/server";
import { ok, route } from "@/lib/http";
import { getStudent } from "@/lib/auth";
import { roomsOf } from "@/lib/students";

export const dynamic = "force-dynamic";

/**
 * GET /api/student/home → the classrooms this student may open (every device's, for an account) and their lectures:
 * { student: { name, account, email? } | null, classrooms: [{ id, name, subject_code, room, teacher, live_class, lecture_count }],
 *   lectures: [{ id, title, status, source, duration_s, created_at, classroom_id, quiz: { best, total } | null }] }
 */
export const GET = route(async () => {
  const s = await getStudent();
  const db = supabaseAdmin();
  const account = s?.acct ? (await db.from("students").select("email,roll_no").eq("id", s.sid).maybeSingle()).data : null;
  const me = s ? { name: s.name, account: !!s.acct, email: account?.email ?? null, roll_no: account?.roll_no ?? null } : null;
  const roomIds = s ? await roomsOf(s) : [];
  if (!s || !roomIds.length) return ok({ student: me, classrooms: [], lectures: [] });
  const [{ data: rooms }, { data: live }, { data: lectures }, { data: quiz }] = await Promise.all([
    db.from("classrooms").select("id,name,subject_code,room,teacher:teachers(name,institution)").in("id", roomIds),
    db.from("classes").select("id,title,started_at,classroom_id").in("classroom_id", roomIds).eq("status", "live").order("started_at", { ascending: false }),
    db
      .from("lectures")
      .select("id,title,status,source,duration_s,created_at,classroom_id")
      .in("classroom_id", roomIds)
      .order("created_at", { ascending: false })
      .limit(300),
    // My best quiz score per lecture (accounts only; empty until schema v5 is applied)
    s.acct
      ? db.from("quiz_attempts").select("lecture_id,best,total").eq("student_id", s.sid)
      : Promise.resolve({ data: [] as { lecture_id: string; best: number; total: number }[] }),
  ]);
  const scores = new Map((quiz ?? []).map((q) => [q.lecture_id, { best: q.best, total: q.total }]));
  const order = new Map(roomIds.map((r, i) => [r, i]));
  const classrooms = (rooms ?? [])
    .map((r) => ({
      ...r,
      live_class: (live ?? []).find((c) => c.classroom_id === r.id) ?? null,
      lecture_count: (lectures ?? []).filter((l) => l.classroom_id === r.id).length,
    }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return ok({ student: me, classrooms, lectures: (lectures ?? []).map((l) => ({ ...l, quiz: scores.get(l.id) ?? null })) });
});
