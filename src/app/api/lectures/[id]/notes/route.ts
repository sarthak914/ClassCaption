import { ok, route, type Ctx } from "@/lib/http";
import { lectureViewer } from "@/lib/access";
import { getLecture, notesIn } from "@/lib/lectures";

export const maxDuration = 120;

// GET /api/lectures/:id/notes?lang=hi  → { title, summary[], key_terms[], quiz[], timeline[] } plus confusion moments
export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const lang = new URL(req.url).searchParams.get("lang") || "en";
  const lec = await getLecture(id);
  await lectureViewer(lec);
  const notes = await notesIn(id, lang);
  return ok({ lang, notes, confusion: lec.confusion ?? [] });
});
