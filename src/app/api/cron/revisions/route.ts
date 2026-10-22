import { timingSafeEqual } from "node:crypto";
import { HttpError, ok, route } from "@/lib/http";
import { internalCronToken, sendRevisionPings } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * GET /api/cron/revisions   (Authorization: Bearer <CRON_SECRET>)
 * Sends revision reminders that are due. Vercel Cron calls it every morning (vercel.json) with
 * CRON_SECRET; a self-hosted server calls it itself every 15 minutes (src/instrumentation.ts).
 */
export const GET = route(async (req: Request) => {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!token || !((secret && same(token, secret)) || same(token, internalCronToken()))) throw new HttpError(401, "Not allowed");
  return ok(await sendRevisionPings());
});
