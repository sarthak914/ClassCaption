import { supabaseAdmin } from "@/lib/supabase/server";
import { body, ok, route } from "@/lib/http";
import { newJoinCode } from "@/lib/classes";

// POST /api/class/start  { title, sourceLang? }  → teacher goes live
export const POST = route(async (req: Request) => {
  const { title, sourceLang } = await body<{ title?: string; sourceLang?: string }>(req);
  const db = supabaseAdmin();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db
      .from("classes")
      .insert({ title: title?.trim() || "Live class", source_lang: sourceLang || "en-IN", join_code: newJoinCode() })
      .select("*")
      .single();
    if (!error) return ok({ class: data, channel: `class:${data.id}` }, 201);
    if (error.code !== "23505") throw error; // retry only on join_code collision
  }
  throw new Error("Could not allocate a join code");
});
