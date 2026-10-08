import { body, need, ok, route } from "@/lib/http";
import { addLanguage, captionsIn, getClassByCode } from "@/lib/classes";
import { LANG_CODES } from "@/lib/languages";
import { HttpError } from "@/lib/http";

// POST /api/class/join  { code, lang }  → student scans QR / types code
export const POST = route(async (req: Request) => {
  const b = await body<{ code?: string; lang?: string }>(req);
  const code = need(b.code, "code is required");
  const lang = b.lang || "en";
  if (!LANG_CODES.includes(lang)) throw new HttpError(400, `Unsupported lang. Use one of: ${LANG_CODES.join(", ")}`);
  const cls = await getClassByCode(code);
  if (cls.status === "live") cls.languages = await addLanguage(cls, lang);
  const captions = await captionsIn(cls, lang, { limit: 30 });
  return ok({ class: cls, lang, captions, channel: `class:${cls.id}` });
});
