import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ok, route, type Ctx } from "@/lib/http";
import { addEvent } from "@/lib/classes";
import { classForTeacher } from "@/lib/access";
import { finishLiveLecture, saveClassAsLecture } from "@/lib/lectures";

export const maxDuration = 120;

/**
 * POST /api/class/:id/end   (the classroom's teacher)
 * Ends the class and saves it as a recorded lecture (captions → segments,
 * "I'm lost" taps → confusion timeline). Notes are generated in the background;
 * poll GET /api/lectures/:id until status = "ready". Students get an "ended" event.
 */
export const POST = route(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const { cls } = await classForTeacher(id);
  if (cls.status === "live") {
    await supabaseAdmin().from("classes").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", id);
  }
  const lectureId = await saveClassAsLecture(id);
  if (!cls.lecture_id) {
    await addEvent(id, "ended", { lecture_id: lectureId }).catch((e) => console.error("ended event:", e.message));
    after(() => finishLiveLecture(lectureId));
  }
  return ok({ classId: id, lectureId });
});
