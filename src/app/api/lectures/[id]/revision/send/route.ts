import { HttpError, ok, route, type Ctx } from "@/lib/http";
import { lectureViewer } from "@/lib/access";
import { getLecture } from "@/lib/lectures";
import { makeDueNow } from "@/lib/revision";
import { sendRevisionPings } from "@/lib/push";

/**
 * POST /api/lectures/:id/revision/send   (the lecture's teacher)
 * Makes the first revision round due now and sends the reminders straight away, instead of
 * tomorrow morning. Handy for a demo, or for a class that wants to revise the same evening.
 * → { due, configured, students, sent }
 */
export const POST = route(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const lecture = await getLecture(id);
  if ((await lectureViewer(lecture)).role !== "teacher") throw new HttpError(403, "Only the teacher can send revision now");
  const due = await makeDueNow(lecture.id);
  return ok({ due, ...(await sendRevisionPings({ lectureId: lecture.id })) });
});
