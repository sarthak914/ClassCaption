import { supabaseAdmin } from "@/lib/supabase/server";
import { body, HttpError, ok, route } from "@/lib/http";
import { clientIp, hashPassword, setTeacherCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/signup { name, email, password, institution?, department? } → teacher account + signed-in cookie
export const POST = route(async (req: Request) => {
  rateLimit(`signup:${clientIp(req)}`, 5, 3600, "Too many accounts created from this network");
  const b = await body<{ name?: string; email?: string; password?: string; institution?: string; department?: string }>(req);
  const name = b.name?.trim() ?? "";
  const email = b.email?.trim().toLowerCase() ?? "";
  if (name.length < 2 || name.length > 80) throw new HttpError(400, "Enter your full name");
  if (!EMAIL.test(email)) throw new HttpError(400, "Enter a valid email address");
  if (!b.password || b.password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("teachers")
    .insert({
      name,
      email,
      institution: b.institution?.trim() || null,
      department: b.department?.trim() || null,
      password_hash: await hashPassword(b.password),
    })
    .select("id,name,email,institution,department")
    .single();
  if (error?.code === "23505") throw new HttpError(409, "An account with this email already exists. Sign in instead.");
  if (error) throw error;

  // Classrooms made before accounts existed belong to the first teacher who signs up.
  const { count } = await db.from("teachers").select("id", { count: "exact", head: true });
  if (count === 1) await db.from("classrooms").update({ teacher_id: data.id }).is("teacher_id", null);

  const res = ok({ teacher: data }, 201);
  setTeacherCookie(res, { tid: data.id });
  return res;
});
