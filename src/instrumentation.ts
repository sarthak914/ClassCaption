/**
 * Self-hosted servers (Docker, `npm start`) have no cron, so the server sends due revision reminders
 * itself every 15 minutes by calling its own cron route. Vercel uses vercel.json instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL || process.env.REVISION_TIMER === "off") return;
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const { createHash } = await import("node:crypto");
  const token = createHash("sha256").update(`classcaption-cron:${process.env.SUPABASE_SERVICE_ROLE_KEY}`).digest("hex");
  const url = `http://127.0.0.1:${process.env.PORT || 3000}/api/cron/revisions`;
  const tick = () => fetch(url, { headers: { authorization: `Bearer ${token}` } }).catch(() => {});
  setTimeout(tick, 60_000);
  setInterval(tick, 15 * 60_000).unref?.();
}
