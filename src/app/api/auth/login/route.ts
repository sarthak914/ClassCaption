import { supabaseAdmin } from "@/lib/supabase/server";
import { body, HttpError, ok, route } from "@/lib/http";
import { checkPassword, clientIp, setTeacherCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

// POST /api/auth/login { email, password } → signed-in cookie
export const POST = route(async (req: Request) => {
  const b = await body<{ email?: string; password?: string }>(req);
  const email = b.email?.trim().toLowerCase() ?? "";
  rateLimit(`login:${clientIp(req)}`, 20, 900, "Too many sign-in attempts");
  rateLimit(`login:${email}`, 8, 900, "Too many sign-in attempts for this account");
  const { data } = await supabaseAdmin()
    .from("teachers")
    .select("id,name,email,institution,department,password_hash")
    .eq("email", email)
    .maybeSingle();
  if (!data || !b.password || !(await checkPassword(b.password, data.password_hash))) throw new HttpError(401, "Wrong email or password");
  const { password_hash: _, ...teacher } = data;
  const res = ok({ teacher });
  setTeacherCookie(res, { tid: teacher.id });
  return res;
});
