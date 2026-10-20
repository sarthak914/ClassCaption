import { ok, route } from "@/lib/http";
import { clearCookies } from "@/lib/auth";

// POST /api/auth/logout { as?: "teacher" | "student" } → clears that session (teacher by default)
export const POST = route(async (req: Request) => {
  const as = ((await req.json().catch(() => ({}))) as { as?: string }).as === "student" ? "student" : "teacher";
  const res = ok({ ok: true });
  clearCookies(res, as);
  return res;
});
