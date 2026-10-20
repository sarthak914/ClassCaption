import { supabaseAdmin } from "@/lib/supabase/server";
import { body, HttpError, ok, route } from "@/lib/http";
import { checkPassword, clientIp, getStudent, setStudentCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { accountSession } from "@/lib/students";

// POST /api/auth/student/login { email, password } → signed-in pass with every classroom the account joined
export const POST = route(async (req: Request) => {
  const b = await body<{ email?: string; password?: string }>(req);
  const email = b.email?.trim().toLowerCase() ?? "";
  rateLimit(`slogin:${clientIp(req)}`, 30, 900, "Too many sign-in attempts");
  rateLimit(`slogin:${email}`, 8, 900, "Too many sign-in attempts for this account");
  const { data } = await supabaseAdmin().from("students").select("id,name,email,roll_no,created_at,password_hash").eq("email", email).maybeSingle();
  if (!data || !b.password || !(await checkPassword(b.password, data.password_hash))) throw new HttpError(401, "Wrong email or password");
  const { password_hash: _, ...student } = data;
  const session = await accountSession(student, await getStudent());
  const res = ok({ student, classrooms: session.rooms.length });
  setStudentCookie(res, session);
  return res;
});
