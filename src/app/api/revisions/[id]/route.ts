import { body, ok, route, type Ctx } from "@/lib/http";
import { requireStudent } from "@/lib/auth";
import { openRevision, submitRevision } from "@/lib/revision";

export const maxDuration = 60;

// GET /api/revisions/:id   (that student) → the round's 3 questions in their language (answers only once finished)
export const GET = route(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const s = await requireStudent();
  return ok({ revision: await openRevision(Number(id), s.sid) });
});

// POST /api/revisions/:id { answers: number[] } → { score, total, answers, questions (with answers and explanations), next }
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const s = await requireStudent();
  const b = await body<{ answers?: unknown }>(req);
  return ok(await submitRevision(Number(id), s.sid, b.answers));
});
