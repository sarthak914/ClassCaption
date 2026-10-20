import "server-only";
import { HttpError } from "./http";

/**
 * In-memory sliding-window limiter. Good enough for one server process (the
 * classroom laptop); a multi-instance deployment would move this to Redis/Postgres.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowS: number, message = "Too many requests. Please wait a moment and try again.") {
  const now = Date.now();
  const since = now - windowS * 1000;
  const list = (hits.get(key) ?? []).filter((t) => t > since);
  if (list.length >= max) {
    const retry = Math.ceil((list[0] + windowS * 1000 - now) / 1000);
    throw new HttpError(429, `${message} (try again in ${retry}s)`);
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => t > since)) hits.delete(k);
}
