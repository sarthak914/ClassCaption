import { body, HttpError, ok, route } from "@/lib/http";
import { translate } from "@/lib/translate";

// POST /api/translate  { texts: string[] | text: string, targets: string[] | target: string, source?: "en" }
export const POST = route(async (req: Request) => {
  const b = await body<{ texts?: string[]; text?: string; targets?: string[]; target?: string; source?: string }>(req);
  const texts = b.texts ?? (b.text ? [b.text] : []);
  const targets = b.targets ?? (b.target ? [b.target] : []);
  if (!texts.length || !targets.length) throw new HttpError(400, "texts/text and targets/target are required");
  if (texts.length > 100) throw new HttpError(400, "At most 100 texts per call");
  const t0 = Date.now();
  const { provider, result } = await translate(texts, targets, b.source ?? "en");
  return ok({ provider, latency_ms: Date.now() - t0, translations: result });
});
