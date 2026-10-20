import { body, HttpError, need, ok, route } from "@/lib/http";
import { explainTerm } from "@/lib/ai/lecture";
import { getStudent, getTeacher } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

// POST /api/explain  { term, context?, lang? }  → tap-to-explain a hard word in a caption (students with a pass, or teachers)
export const POST = route(async (req: Request) => {
  const [t, s] = await Promise.all([getTeacher(), getStudent()]);
  if (!t && !s) throw new HttpError(401, "Join your class with its PIN first");
  rateLimit(`explain:${s?.sid ?? t!.tid}`, 20, 60, "Too many lookups");
  const b = await body<{ term?: string; context?: string; lang?: string }>(req);
  const term = need(b.term?.trim().slice(0, 80), "term is required");
  return ok(await explainTerm(term, (b.context ?? "").slice(0, 1000), b.lang ?? "en"));
});
