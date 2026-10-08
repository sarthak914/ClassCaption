import { supabaseAdmin } from "@/lib/supabase/server";
import { ok, route, type Ctx } from "@/lib/http";
import { getClass } from "@/lib/classes";

/**
 * GET /api/class/:id/stats?window=60
 * Teacher dashboard numbers: confusion meter + pace coach.
 */
export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const windowS = Number(new URL(req.url).searchParams.get("window") ?? 60);
  const cls = await getClass(id);
  const db = supabaseAdmin();
  const since = new Date(Date.now() - windowS * 1000).toISOString();
  const [lostRecent, lostTotal, questions, recentCaps, total] = await Promise.all([
    db.from("reactions").select("id", { count: "exact", head: true }).eq("class_id", id).eq("kind", "lost").gte("created_at", since),
    db.from("reactions").select("id", { count: "exact", head: true }).eq("class_id", id).eq("kind", "lost"),
    db.from("reactions").select("*").eq("class_id", id).eq("kind", "question").order("created_at", { ascending: false }).limit(20),
    db.from("captions").select("text,created_at").eq("class_id", id).gte("created_at", since),
    db.from("captions").select("id", { count: "exact", head: true }).eq("class_id", id),
  ]);

  const words = (recentCaps.data ?? []).reduce((n, c) => n + c.text.split(/\s+/).filter(Boolean).length, 0);
  const elapsed = Math.min(windowS, (Date.now() - new Date(cls.started_at).getTime()) / 1000);
  const wpm = elapsed > 5 ? Math.round((words / elapsed) * 60) : 0;
  const pace = wpm === 0 ? "silent" : wpm > 160 ? "too_fast" : wpm < 90 ? "slow" : "good";

  return ok({
    status: cls.status,
    languages: cls.languages,
    captions: total.count ?? 0,
    lost_recent: lostRecent.count ?? 0,
    lost_total: lostTotal.count ?? 0,
    window_s: windowS,
    wpm,
    pace,
    questions: questions.data ?? [],
  });
});
