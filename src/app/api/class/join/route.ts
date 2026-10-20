import { body, HttpError, ok, route } from "@/lib/http";
import { addLanguage, captionsIn, getClassroomByPin, liveClassOf } from "@/lib/classes";
import { LANG_CODES } from "@/lib/languages";
import { clientIp, getStudent, newStudentId, setStudentCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { hasFoulLanguage } from "@/lib/profanity";

/**
 * POST /api/class/join  { pin, name, lang }   (student types or scans the classroom PIN)
 * Gives the device a signed student pass for that classroom, so it can open the
 * live class, react, and see the classroom's recorded lectures. PIN guessing is
 * rate-limited per network.
 * → { classroom, live_class | null, captions (last 30 in `lang`, when live), lang }
 */
export const POST = route(async (req: Request) => {
  const b = await body<{ pin?: string; code?: string; name?: string; lang?: string }>(req);
  const pin = (b.pin ?? b.code ?? "").trim();
  const name = (b.name ?? "").trim().replace(/\s+/g, " ");
  const lang = b.lang || "en";
  if (!pin) throw new HttpError(400, "Enter the classroom PIN");
  if (name.length < 2 || name.length > 40) throw new HttpError(400, "Enter your name (2 to 40 characters)");
  // The name is shown to the teacher and read aloud with "Speak for me", so it gets the word filter too.
  if (hasFoulLanguage(name)) throw new HttpError(422, "Please use your real name");
  if (!LANG_CODES.includes(lang)) throw new HttpError(400, `Unsupported lang. Use one of: ${LANG_CODES.join(", ")}`);

  rateLimit(`join:${clientIp(req)}`, 15, 600, "Too many PIN attempts from this network");
  const room = await getClassroomByPin(pin);

  const prev = await getStudent();
  const student = {
    sid: prev?.sid ?? newStudentId(),
    name,
    rooms: [room.id, ...(prev?.rooms ?? []).filter((r) => r !== room.id)].slice(0, 30),
  };

  const live = await liveClassOf(room.id);
  let captions: unknown[] = [];
  if (live) {
    live.languages = await addLanguage(live, lang);
    captions = await captionsIn(live, lang, { limit: 30 });
  }
  const { teacher_id: _t, join_code: _j, ...classroom } = room;
  const res = ok({ classroom, live_class: live ? { id: live.id, title: live.title, started_at: live.started_at } : null, captions, lang });
  setStudentCookie(res, student);
  return res;
});
