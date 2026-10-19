import { supabaseAdmin } from "@/lib/supabase/server";
import { HttpError, ok, route, type Ctx } from "@/lib/http";
import { liveClassOf } from "@/lib/classes";
import { viewerOf } from "@/lib/access";

// GET /api/classrooms/:id/live (teacher or joined student) → { live_class: { id, title, started_at } | null }
export const GET = route(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const { data: room } = await supabaseAdmin().from("classrooms").select("id,teacher_id").eq("id", id).maybeSingle();
  if (!room) throw new HttpError(404, "Classroom not found");
  await viewerOf(room);
  const live = await liveClassOf(id);
  return ok({ live_class: live ? { id: live.id, title: live.title, started_at: live.started_at } : null });
});
