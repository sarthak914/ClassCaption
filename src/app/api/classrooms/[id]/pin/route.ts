import { supabaseAdmin } from "@/lib/supabase/server";
import { ok, route, type Ctx } from "@/lib/http";
import { newJoinCode } from "@/lib/classes";
import { ownedClassroom } from "@/lib/access";

// POST /api/classrooms/:id/pin (the classroom's teacher) → new PIN; the old one stops working for new joins
export const POST = route(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  await ownedClassroom(id);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabaseAdmin().from("classrooms").update({ join_code: newJoinCode() }).eq("id", id).select("id,join_code").single();
    if (!error) return ok({ classroom: data });
    if (error.code !== "23505") throw error;
  }
  throw new Error("Could not allocate a classroom PIN");
});
