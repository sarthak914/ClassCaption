import { body, HttpError, need, ok, route, type Ctx } from "@/lib/http";
import { askLecture } from "@/lib/ai/lecture";
import { getSegments } from "@/lib/lectures";

export const maxDuration = 60;

// POST /api/lectures/:id/ask  { question, lang? }  → { answer, found_in_lecture, citations: [{ idx, start_s, quote }] }
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const b = await body<{ question?: string; lang?: string }>(req);
  const question = need(b.question?.trim(), "question is required");
  const segs = await getSegments(id);
  if (!segs.length) throw new HttpError(409, "Lecture has no transcript yet");
  return ok(await askLecture(segs, question, b.lang ?? "en"));
});
