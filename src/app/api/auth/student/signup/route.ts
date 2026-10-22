import { supabaseAdmin } from "@/lib/supabase/server";
import { body, HttpError, ok, route } from "@/lib/http";
import { clientIp, getStudent, hashPassword, setStudentCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { hasFoulLanguage } from "@/lib/profanity";
import { accountSession } from "@/lib/students";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/student/signup { name, email, password, rollNo? } → student account + signed-in pass.
 * Classrooms this device already joined with a PIN move into the account.
 */
export const POST = route(async (req: Request) => {
  rateLimit(`ssignup:${clientIp(req)}`, 10, 3600, "Too many accounts created from this network");
  const b = await body<{ name?: string; email?: string; password?: string; rollNo?: string }>(req);
  const name = (b.name ?? "").trim().replace(/\s+/g, " ");
  const email = b.email?.trim().toLowerCase() ?? "";
  if (name.length < 2 || name.length > 40) throw new HttpError(400, "Enter your name (2 to 40 characters)");
  if (hasFoulLanguage(name)) throw new HttpError(422, "Please use your real name");
  if (!EMAIL.test(email)) throw new HttpError(400, "Enter a valid email address");
  if (!b.password || b.password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");

  const { data, error } = await supabaseAdmin()
    .from("students")
    .insert({ name, email, roll_no: b.rollNo?.trim().slice(0, 30) || null, password_hash: await hashPassword(b.password) })
    .select("id,name,email,roll_no,created_at")
    .single();
  if (error?.code === "23505") throw new HttpError(409, "An account with this email already exists. Sign in instead.");
  if (error) throw error;

  const session = await accountSession(data, await getStudent());
  const res = ok({ student: data, classrooms: session.rooms.length }, 201);
  setStudentCookie(res, session);
  return res;
});
