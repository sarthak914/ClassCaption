import { body, HttpError, need, ok, route, type Ctx } from "@/lib/http";
import { askLecture } from "@/lib/ai/lecture";
import { getLecture, getSegments } from "@/lib/lectures";
import { lectureViewer } from "@/lib/access";
import { rateLimit } from "@/lib/ratelimit";

export const maxDuration = 60;

// POST /api/lectures/:id/ask  { question, lang? }  → { answer, found_in_lecture, citations: [{ idx, start_s, quote }] }
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const b = await body<{ question?: string; lang?: string }>(req);
  const question = need(b.question?.trim().slice(0, 500), "question is required");
  const lec = await getLecture(id);
  const viewer = await lectureViewer(lec);
  rateLimit(`ask:${viewer.role === "student" ? viewer.student.sid : viewer.teacher.tid}`, 15, 300, "Too many questions");
  const segs = await getSegments(lec.id);
  if (!segs.length) throw new HttpError(409, "Lecture has no transcript yet");
  return ok(await askLecture(segs, question, b.lang ?? "en"));
});
