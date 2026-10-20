import { HttpError, ok, route } from "@/lib/http";
import { readBoard } from "@/lib/ai/board";
import { requireTeacher } from "@/lib/auth";
import { classForTeacher } from "@/lib/access";
import { addEvent, translateForClass } from "@/lib/classes";
import { rateLimit } from "@/lib/ratelimit";

export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // vision APIs accept ~4 MB inline images

/**
 * POST /api/board  (signed-in teacher; board capture: whiteboard/slide photo → text, equations, described diagrams)
 *   multipart/form-data: image=<file>, lang?=hi, context?=lecture title, classId?
 *   or JSON: { imageBase64, mimeType, lang?, context?, classId? }
 * With classId (a live class the teacher owns) the result is translated for every
 * student language and pushed to the class as a "board" event.
 */
export const POST = route(async (req: Request) => {
  let bytes: Buffer;
  let mime = "image/jpeg";
  let lang = "en";
  let context: string | undefined;
  let classId: string | undefined;
  const teacher = await requireTeacher();
  rateLimit(`board:${teacher.tid}`, 20, 600, "Too many board scans");

  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof Blob)) throw new HttpError(400, 'Send the photo as form field "image"');
    bytes = Buffer.from(await file.arrayBuffer());
    mime = file.type || mime;
    lang = String(form.get("lang") || lang);
    context = form.get("context") ? String(form.get("context")) : undefined;
    classId = form.get("classId") ? String(form.get("classId")) : undefined;
  } else {
    const b = (await req.json().catch(() => ({}))) as { imageBase64?: string; mimeType?: string; lang?: string; context?: string; classId?: string };
    lang = b.lang || lang;
    context = b.context;
    classId = b.classId;
    // (Fetching an imageUrl was removed: a server that fetches any URL it is given can be pointed at internal hosts.)
    if (!b.imageBase64) throw new HttpError(400, "Send an image: multipart field 'image', or JSON imageBase64");
    bytes = Buffer.from(b.imageBase64.replace(/^data:[^,]+,/, ""), "base64");
    mime = b.mimeType || b.imageBase64.match(/^data:([^;]+);/)?.[1] || mime;
  }
  if (!mime.startsWith("image/")) throw new HttpError(400, `Not an image (${mime})`);
  if (bytes.length > MAX_BYTES) throw new HttpError(413, "Image is over 4 MB; resize or compress it (e.g. 1600px wide JPEG)");

  const cls = classId ? (await classForTeacher(classId)).cls : null;
  if (cls && cls.status !== "live") throw new HttpError(409, "Class has ended");

  const t0 = Date.now();
  const result = await readBoard({ mime, base64: bytes.toString("base64") }, lang, context);
  const out = { ...result, lang, latency_ms: Date.now() - t0 };
  if (cls) {
    // One translation call for every student language: explanation, diagram descriptions, spoken equations.
    const texts = [result.explanation, ...result.diagrams.map((d) => d.description), ...result.equations.map((e) => e.spoken)];
    const translations = await translateForClass(cls, texts, lang);
    await addEvent(cls.id, "board", { board: out, translations });
  }
  return ok(out);
});
