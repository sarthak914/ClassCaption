import { ok, route, type Ctx } from "@/lib/http";
import { addLanguage, captionsIn, latestEvents, studentView } from "@/lib/classes";
import { classForViewer } from "@/lib/access";

// GET /api/class/:id?lang=hi&since=<seq>&limit=50   (classroom's teacher, or a student who joined it)
// Class info + captions with `display` in the requested language, plus the latest board scan and announcement.
// Use `since` to catch up after a reconnect; switching lang backfills translations.
export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang");
  const since = url.searchParams.get("since");
  const { cls, viewer } = await classForViewer(id);
  if (lang && cls.status === "live") cls.languages = await addLanguage(cls, lang);
  const [captions, events] = await Promise.all([
    captionsIn(cls, lang, {
      sinceSeq: since !== null ? Number(since) : undefined,
      limit: Math.min(200, Number(url.searchParams.get("limit") ?? 50)),
    }),
    since === null ? latestEvents(cls.id) : Promise.resolve(null),
  ]);
  return ok({
    class: viewer.role === "teacher" ? cls : studentView(cls),
    captions,
    ...(events ? { events } : {}),
    me: viewer.role === "student" ? { role: "student", name: viewer.student.name } : { role: "teacher" },
  });
});
