import { ok, route } from "@/lib/http";
import { getStudent } from "@/lib/auth";
import { revisionsFor } from "@/lib/revision";

export const dynamic = "force-dynamic";

/**
 * GET /api/revisions   (student) → my spaced-revision rounds:
 * { due: [...], upcoming: [...], done: [...] }, each { id, lecture_id, title, classroom, lang, step, due_at, done_at, score, total }
 */
export const GET = route(async () => {
  const s = await getStudent();
  if (!s) return ok({ due: [], upcoming: [], done: [] });
  return ok(await revisionsFor(s.sid));
});
