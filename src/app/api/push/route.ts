import { body, HttpError, ok, route } from "@/lib/http";
import { requireStudent } from "@/lib/auth";
import { pushConfigured, removeSubscription, saveSubscription, vapidPublicKey } from "@/lib/push";
import { LANG_CODES } from "@/lib/languages";

// GET /api/push → { publicKey } (null when revision reminders aren't set up on this server)
export const GET = route(async () => ok({ publicKey: pushConfigured() ? vapidPublicKey() : null }));

// POST /api/push { subscription, lang }   (student) → this browser gets revision reminders in `lang`
export const POST = route(async (req: Request) => {
  const s = await requireStudent();
  if (!pushConfigured()) throw new HttpError(501, "Reminders aren't set up on this server (VAPID keys missing)");
  const b = await body<{ subscription?: { endpoint?: string }; lang?: string }>(req);
  if (!b.subscription) throw new HttpError(400, "subscription is required");
  await saveSubscription(s.sid, b.subscription, b.lang && LANG_CODES.includes(b.lang) ? b.lang : "en");
  return ok({ ok: true }, 201);
});

// DELETE /api/push { endpoint }   (student) → stop reminders on this browser
export const DELETE = route(async (req: Request) => {
  const s = await requireStudent();
  const b = await body<{ endpoint?: string }>(req);
  if (b.endpoint) await removeSubscription(s.sid, b.endpoint);
  return ok({ ok: true });
});
