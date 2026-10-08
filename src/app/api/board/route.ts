import { HttpError, ok, route } from "@/lib/http";
import { readBoard } from "@/lib/ai/board";

export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // vision APIs accept ~4 MB inline images

/**
 * POST /api/board  (board capture: whiteboard/slide photo → text, equations, described diagrams)
 *   multipart/form-data: image=<file>, lang?=hi, context?=lecture title
 *   or JSON: { imageBase64, mimeType, lang?, context? }  |  { imageUrl, lang?, context? }
 */
export const POST = route(async (req: Request) => {
  let bytes: Buffer;
  let mime = "image/jpeg";
  let lang = "en";
  let context: string | undefined;

  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof Blob)) throw new HttpError(400, 'Send the photo as form field "image"');
    bytes = Buffer.from(await file.arrayBuffer());
    mime = file.type || mime;
    lang = String(form.get("lang") || lang);
    context = form.get("context") ? String(form.get("context")) : undefined;
  } else {
    const b = (await req.json().catch(() => ({}))) as { imageBase64?: string; mimeType?: string; imageUrl?: string; lang?: string; context?: string };
    lang = b.lang || lang;
    context = b.context;
    if (b.imageBase64) {
      bytes = Buffer.from(b.imageBase64.replace(/^data:[^,]+,/, ""), "base64");
      mime = b.mimeType || b.imageBase64.match(/^data:([^;]+);/)?.[1] || mime;
    } else if (b.imageUrl) {
      const r = await fetch(b.imageUrl, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new HttpError(400, `Could not fetch imageUrl (${r.status})`);
      bytes = Buffer.from(await r.arrayBuffer());
      mime = r.headers.get("content-type")?.split(";")[0] || mime;
    } else throw new HttpError(400, "Send an image: multipart field 'image', or JSON imageBase64 / imageUrl");
  }
  if (!mime.startsWith("image/")) throw new HttpError(400, `Not an image (${mime})`);
  if (bytes.length > MAX_BYTES) throw new HttpError(413, "Image is over 4 MB; resize or compress it (e.g. 1600px wide JPEG)");

  const t0 = Date.now();
  const result = await readBoard({ mime, base64: bytes.toString("base64") }, lang, context);
  return ok({ ...result, lang, latency_ms: Date.now() - t0 });
});
