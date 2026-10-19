import { body, HttpError, need, ok, route, type Ctx } from "@/lib/http";
import { addEvent, translateForClass } from "@/lib/classes";
import { classForTeacher } from "@/lib/access";
import { baseLang } from "@/lib/languages";

// POST /api/class/:id/announce { text }  (classroom's teacher) → translated for every student language and pushed live
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const { cls } = await classForTeacher(id);
  if (cls.status !== "live") throw new HttpError(409, "Class has ended");
  const text = need((await body<{ text?: string }>(req)).text?.trim().slice(0, 500), "text is required");
  const tr = await translateForClass(cls, [text]);
  const translations = Object.fromEntries(Object.entries(tr).map(([l, v]) => [l, v[0]]));
  const event = await addEvent(id, "announcement", { text, lang: baseLang(cls.source_lang), translations });
  return ok({ event }, 201);
});
