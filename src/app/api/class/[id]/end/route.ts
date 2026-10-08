import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ok, route, type Ctx } from "@/lib/http";
import { getClass } from "@/lib/classes";
import { finishLiveLecture, saveClassAsLecture } from "@/lib/lectures";

export const maxDuration = 120;

/**
 * POST /api/class/:id/end
 * Ends the class and saves it as a recorded lecture (captions → segments,
 * "I'm lost" taps → confusion timeline). Notes are generated in the background;
 * watch the lecture row (Realtime or GET /api/lectures/:id) until status = "ready".
 */
export const POST = route(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const cls = await getClass(id);
  if (cls.status === "live") {
    await supabaseAdmin().from("classes").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", id);
  }
  const lectureId = await saveClassAsLecture(id);
  if (!cls.lecture_id) after(() => finishLiveLecture(lectureId));
  return ok({ classId: id, lectureId });
});
