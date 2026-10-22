import { createHash } from "node:crypto";

// Calls the server's own cron route, with the same internal token lib/push.ts accepts.
if (!process.env.VERCEL && process.env.REVISION_TIMER !== "off" && process.env.VAPID_PRIVATE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const token = createHash("sha256").update(`classcaption-cron:${process.env.SUPABASE_SERVICE_ROLE_KEY}`).digest("hex");
  const url = `http://127.0.0.1:${process.env.PORT || 3000}/api/cron/revisions`;
  const tick = () => fetch(url, { headers: { authorization: `Bearer ${token}` } }).catch(() => {});
  setTimeout(tick, 60_000);
  setInterval(tick, 15 * 60_000).unref?.();
}
