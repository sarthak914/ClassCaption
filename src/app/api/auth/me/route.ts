import { supabaseAdmin } from "@/lib/supabase/server";
import { ok, route } from "@/lib/http";
import { getStudent, getTeacher } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/auth/me → { teacher: {id,name,email,institution,department} | null, student: {name, classrooms} | null }
export const GET = route(async () => {
  const [t, s] = await Promise.all([getTeacher(), getStudent()]);
  const teacher = t
    ? (await supabaseAdmin().from("teachers").select("id,name,email,institution,department").eq("id", t.tid).maybeSingle()).data
    : null;
  return ok({ teacher, student: s ? { name: s.name, classrooms: s.rooms.length, account: !!s.acct } : null });
});
