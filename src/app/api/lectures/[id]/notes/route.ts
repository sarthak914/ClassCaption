import { ok, route, type Ctx } from "@/lib/http";
import { getLecture, notesIn } from "@/lib/lectures";

export const maxDuration = 120;

// GET /api/lectures/:id/notes?lang=hi  → { title, summary[], key_terms[], quiz[], timeline[] } plus confusion moments
export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const lang = new URL(req.url).searchParams.get("lang") || "en";
  const notes = await notesIn(id, lang);
  const lec = await getLecture(id);
  return ok({ lang, notes, confusion: lec.confusion ?? [] });
});
