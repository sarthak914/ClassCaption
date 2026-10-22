import { body, HttpError, ok, route, type Ctx } from "@/lib/http";
import { lectureViewer } from "@/lib/access";
import { getLecture } from "@/lib/lectures";
import { scheduleOne } from "@/lib/revision";

// POST /api/lectures/:id/revision { lang }   (a student of this lecture) → 3 questions tomorrow morning, then day 3 and day 7
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const lecture = await getLecture(id);
  const viewer = await lectureViewer(lecture);
  if (viewer.role !== "student") throw new HttpError(403, "Only students can schedule revision");
  const b = await body<{ lang?: string }>(req);
  return ok(await scheduleOne(viewer.student.sid, lecture.id, b.lang ?? "en"), 201);
});
