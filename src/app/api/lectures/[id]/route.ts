import { supabaseAdmin, LECTURE_BUCKET } from "@/lib/supabase/server";
import { ok, route, type Ctx } from "@/lib/http";
import { getLecture, getSegments } from "@/lib/lectures";

// GET /api/lectures/:id  → lecture (status, progress, notes, confusion), segments, and a 2-hour media URL
export const GET = route(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const lecture = await getLecture(id); // accepts a lecture id or an ended live class id
  const segments = await getSegments(lecture.id);
  let mediaUrl: string | null = null;
  if (lecture.audio_path) {
    const { data } = await supabaseAdmin().storage.from(LECTURE_BUCKET).createSignedUrl(lecture.audio_path, 7200);
    mediaUrl = data?.signedUrl ?? null;
  }
  return ok({ lecture, segments, mediaUrl });
});
