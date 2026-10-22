/**
 * Self-hosted servers (Docker, `npm start`) have no cron, so the server sends due revision reminders
 * itself every 15 minutes (see instrumentation-node.ts). Vercel uses vercel.json instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node");
}
