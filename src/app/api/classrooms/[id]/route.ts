import { supabaseAdmin } from "@/lib/supabase/server";
import { body, HttpError, ok, route, type Ctx } from "@/lib/http";
import { ownedClassroom } from "@/lib/access";
import { glossaryTerms, SPEECH_CODES } from "@/lib/languages";

/**
 * PATCH /api/classrooms/:id  (classroom's teacher) { glossary?, default_source_language? } → { classroom }
 * glossary: names and subject terms, one per line or comma-separated. Used by Whisper and the translator
 * so they are always recognised and spelled the same way. Takes effect on the next caption, even mid-class.
 */
export const PATCH = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  await ownedClassroom(id);
  const b = await body<{ glossary?: string; default_source_language?: string }>(req);
  const patch: Record<string, unknown> = {};
  if (typeof b.glossary === "string") patch.glossary = glossaryTerms(b.glossary).join("\n") || null;
  if (b.default_source_language !== undefined) {
    if (!SPEECH_CODES.includes(b.default_source_language)) throw new HttpError(400, "Unsupported speech language");
    patch.default_source_language = b.default_source_language;
  }
  if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to update");
  const { data, error } = await supabaseAdmin().from("classrooms").update(patch).eq("id", id).select("*").single();
  if (error?.code === "PGRST204") throw new HttpError(409, "The word list needs a database update: re-run supabase/schema.sql in Supabase");
  if (error) throw error;
  return ok({ classroom: data });
});
