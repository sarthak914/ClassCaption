import { supabaseAdmin, LECTURE_BUCKET } from "@/lib/supabase/server";
import { body, need, ok, route } from "@/lib/http";

/**
 * POST /api/lectures  { title, filename, contentType?, classroomId? }
 * Creates the lecture row and a one-time signed upload URL. The browser uploads
 * the file straight to Supabase Storage (bypasses Vercel's 4.5 MB body limit):
 *   supabase.storage.from("lectures").uploadToSignedUrl(path, token, file)
 * or: curl -X PUT -H "content-type: audio/mpeg" --data-binary @file "<uploadUrl>"
 * Then call POST /api/lectures/:id/process.
 */
export const POST = route(async (req: Request) => {
  const b = await body<{ title?: string; filename?: string; contentType?: string; classroomId?: string }>(req);
  const filename = need(b.filename, "filename is required");
  const db = supabaseAdmin();
  const { data: lec, error } = await db
    .from("lectures")
    .insert({
      title: b.title?.trim() || filename.replace(/\.[^.]+$/, ""),
      source: "upload",
      media_type: b.contentType ?? null,
      classroom_id: b.classroomId || null,
    })
    .select("*")
    .single();
  if (error) throw error;

  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${lec.id}/${safe}`;
  const { data: up, error: upErr } = await db.storage.from(LECTURE_BUCKET).createSignedUploadUrl(path);
  if (upErr) throw upErr;
  await db.from("lectures").update({ audio_path: path }).eq("id", lec.id);

  return ok({ lecture: { ...lec, audio_path: path }, upload: { path, token: up.token, uploadUrl: up.signedUrl, bucket: LECTURE_BUCKET } }, 201);
});

// GET /api/lectures?classroomId=&status=ready  → recent lectures for the dashboard
export const GET = route(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  let q = supabaseAdmin()
    .from("lectures")
    .select("id,title,source,status,progress,duration_s,class_id,classroom_id,media_type,created_at,error,classroom:classrooms(name,subject_code,room)");
  if (u.get("classroomId")) q = q.eq("classroom_id", u.get("classroomId")!);
  if (u.get("status")) q = q.eq("status", u.get("status")!);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return ok({ lectures: data });
});
