import "server-only";
import { createHash } from "node:crypto";
import webpush from "web-push";
import { supabaseAdmin } from "./supabase/server";
import { translate } from "./translate";
import { missingTable } from "./revision";

/**
 * Web Push reminders for revision rounds. Needs VAPID keys in the env (generate once with
 * `npx web-push generate-vapid-keys`) and an https site (or localhost); without them students
 * still see due revisions on their home screen.
 */
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;
export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let ready = false;
function setup() {
  if (ready) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:classcaption@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
}

export async function saveSubscription(sid: string, subscription: { endpoint?: string }, lang: string) {
  if (!subscription?.endpoint || !/^https:\/\//.test(subscription.endpoint)) throw new Error("Invalid push subscription");
  const { error } = await supabaseAdmin()
    .from("push_subscriptions")
    .upsert({ endpoint: subscription.endpoint, student_sid: sid, subscription, lang }, { onConflict: "endpoint" });
  if (error) throw error;
}

export async function removeSubscription(sid: string, endpoint: string) {
  await supabaseAdmin().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("student_sid", sid);
}

/** The reminder in the student's language (English if translation fails). */
async function message(lang: string, count: number, title: string) {
  const en = [count > 1 ? `${count} revisions are waiting` : "Revision time: 3 quick questions", `From "${title}". It takes a minute.`];
  if (lang === "en") return en;
  try {
    return (await translate(en, [lang], "en")).result[lang] ?? en;
  } catch {
    return en;
  }
}

/**
 * Sends one reminder per student for every revision round that is due and not yet announced.
 * Runs from the cron route (Vercel Cron, or the timer in instrumentation.ts) and from the teacher's
 * "Send now" button. A round is marked notified only once a push actually went out.
 */
export async function sendRevisionPings(opts: { lectureId?: string } = {}) {
  if (!pushConfigured()) return { configured: false, students: 0, sent: 0 };
  setup();
  const db = supabaseAdmin();
  let q = db
    .from("revisions")
    .select("id,student_sid,lecture:lectures(title)")
    .is("done_at", null)
    .is("notified_at", null)
    .lte("due_at", new Date().toISOString())
    .limit(1000);
  if (opts.lectureId) q = q.eq("lecture_id", opts.lectureId);
  const { data: due, error } = await q;
  if (error) {
    if (missingTable(error)) return { configured: true, students: 0, sent: 0 };
    throw error;
  }
  const bySid = new Map<string, { ids: number[]; title: string }>();
  for (const r of due ?? []) {
    const cur = bySid.get(r.student_sid) ?? { ids: [], title: (r.lecture as unknown as { title: string } | null)?.title ?? "your lecture" };
    cur.ids.push(r.id);
    bySid.set(r.student_sid, cur);
  }
  if (!bySid.size) return { configured: true, students: 0, sent: 0 };

  const { data: subs } = await db.from("push_subscriptions").select("endpoint,student_sid,subscription,lang").in("student_sid", [...bySid.keys()]);
  let sent = 0;
  const notified: number[] = [];
  for (const [sid, info] of bySid) {
    const mine = (subs ?? []).filter((s) => s.student_sid === sid);
    let ok = false;
    for (const s of mine) {
      const [title, body] = await message(s.lang, info.ids.length, info.title);
      try {
        await webpush.sendNotification(s.subscription, JSON.stringify({ title, body, url: "/student/revise", tag: "cc-revision" }), { TTL: 12 * 3600 });
        ok = true;
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint); // unsubscribed
        else console.error("push:", (e as Error).message);
      }
    }
    if (ok) notified.push(...info.ids);
  }
  if (notified.length) await db.from("revisions").update({ notified_at: new Date().toISOString() }).in("id", notified);
  return { configured: true, students: bySid.size, sent };
}

/** Lets the in-process timer call the cron route without a CRON_SECRET being set. */
export function internalCronToken() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHash("sha256").update(`classcaption-cron:${key}`).digest("hex");
}
