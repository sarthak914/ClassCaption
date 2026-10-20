import { body, ok, route, type Ctx } from "@/lib/http";
import { getLecture, processUpload } from "@/lib/lectures";
import { lectureViewer } from "@/lib/access";
import { HttpError } from "@/lib/http";

export const maxDuration = 300;

/**
 * POST /api/lectures/:id/process  { language?: "en" | "hi" }
 * Runs the recorded pipeline synchronously: Groq Whisper → segments → Gemini notes.
 * Progress is written to the lecture row (status/progress), so a UI can show it via Realtime.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  if ((await lectureViewer(await getLecture(id))).role !== "teacher") throw new HttpError(403, "Only the teacher can process a recording");
  const b = req.headers.get("content-type")?.includes("json") ? await body<{ language?: string }>(req) : {};
  const result = await processUpload(id, b.language);
  return ok({ lectureId: id, status: "ready", ...result });
});
