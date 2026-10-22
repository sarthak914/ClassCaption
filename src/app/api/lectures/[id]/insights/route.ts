import { HttpError, ok, route, type Ctx } from "@/lib/http";
import { lectureViewer } from "@/lib/access";
import { getLecture } from "@/lib/lectures";
import { buildInsights } from "@/lib/insights";
import { pushConfigured } from "@/lib/push";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

/**
 * GET /api/lectures/:id/insights?refresh=1   (the lecture's teacher)
 * The class report: confusion spikes, unanswered questions, pace, languages, quiz and revision results,
 * plus AI advice (topics to revisit, suggested answers, how to open the next class).
 */
export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const lecture = await getLecture(id);
  if ((await lectureViewer(lecture)).role !== "teacher") throw new HttpError(403, "Only the teacher can see the class report");
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  return ok({ insights: await buildInsights(lecture.id, { refresh }), push: pushConfigured() });
});
