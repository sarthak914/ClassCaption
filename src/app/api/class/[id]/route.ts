import { ok, route, type Ctx } from "@/lib/http";
import { addLanguage, captionsIn, getClass } from "@/lib/classes";

// GET /api/class/:id?lang=hi&since=<seq>&limit=50
// Class info + captions with `display` in the requested language.
// Use `since` to catch up after a reconnect; switching lang backfills translations.
export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang");
  const since = url.searchParams.get("since");
  const cls = await getClass(id);
  if (lang && cls.status === "live") cls.languages = await addLanguage(cls, lang);
  const captions = await captionsIn(cls, lang, {
    sinceSeq: since !== null ? Number(since) : undefined,
    limit: Number(url.searchParams.get("limit") ?? 50),
  });
  return ok({ class: cls, captions });
});
