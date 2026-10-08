import { supabaseAdmin } from "@/lib/supabase/server";
import { ok } from "@/lib/http";
import { geminiModel } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";

// GET /api/health → which keys are configured and whether the database schema is in place. Never returns secrets.
export async function GET() {
  const env = {
    supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabase_anon_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabase_service_role_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    bhashini: !!(process.env.BHASHINI_USER_ID && process.env.BHASHINI_API_KEY),
  };
  let database: string = "not checked";
  try {
    const db = supabaseAdmin();
    const checks = await Promise.all(
      ["classes", "captions", "reactions", "lectures", "segments"].map(async (t) => {
        const { error } = await db.from(t).select("*", { head: true, count: "exact" }).limit(1);
        return error ? `${t}: ${error.message}` : null;
      }),
    );
    const { error: bErr } = await db.storage.getBucket("lectures");
    const problems = [...checks.filter(Boolean), ...(bErr ? [`bucket lectures: ${bErr.message}`] : [])];
    database = problems.length ? `missing: ${problems.join("; ")} (run supabase/schema.sql)` : "ok";
  } catch (e) {
    database = (e as Error).message;
  }
  return ok({
    ok: database === "ok" && env.gemini && env.groq,
    env,
    database,
    gemini_model: geminiModel(),
    translation_providers: process.env.TRANSLATION_PROVIDERS || "bhashini,gemini,groq,google",
  });
}
