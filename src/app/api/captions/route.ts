import { body, HttpError, need, ok, route } from "@/lib/http";
import { classForTeacher } from "@/lib/access";
import { publishCaption } from "@/lib/captions";

/**
 * POST /api/captions  { classId, text, seq?, offsetS?, targets?, context? }
 * Called by the teacher's browser (signed in, owns the classroom) with each finished Web Speech phrase.
 * `context` = the previous caption lines, so the translator keeps meaning and terms consistent.
 */
export const POST = route(async (req: Request) => {
  const t0 = Date.now();
  const b = await body<{ classId?: string; text?: string; seq?: number; offsetS?: number; targets?: string[]; context?: string[] }>(req);
  const classId = need(b.classId, "classId is required");
  const text = need(b.text?.trim().slice(0, 2000), "text is required");
  const { cls } = await classForTeacher(classId);
  if (cls.status !== "live") throw new HttpError(409, "Class has ended");

  const { caption, provider, translateError } = await publishCaption(cls, text, {
    seq: b.seq,
    offsetS: b.offsetS,
    targets: b.targets,
    context: Array.isArray(b.context) ? b.context : undefined,
  });
  return ok({ caption, provider, latency_ms: Date.now() - t0, ...(translateError ? { translateError } : {}) }, 201);
});
