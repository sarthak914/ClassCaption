import { supabaseAdmin, LECTURE_BUCKET } from "@/lib/supabase/server";
import { body, need, ok, route } from "@/lib/http";
import { requireTeacher } from "@/lib/auth";
import { ownedClassroom } from "@/lib/access";
import { rateLimit } from "@/lib/ratelimit";

/**
 * POST /api/lectures  { title, filename, contentType?, classroomId? }   (signed-in teacher)
 * Creates the lecture row and a one-time signed upload URL. The browser uploads
 * the file straight to Supabase Storage (bypasses Vercel's 4.5 MB body limit):
 *   supabase.storage.from("lectures").uploadToSignedUrl(path, token, file)
 * or: curl -X PUT -H "content-type: audio/mpeg" --data-binary @file "<uploadUrl>"
 * Then call POST /api/lectures/:id/process.
 */
export const POST = route(async (req: Request) => {
  const teacher = await requireTeacher();
  rateLimit(`upload:${teacher.tid}`, 20, 3600, "Too many uploads");
  const b = await body<{ title?: string; filename?: string; contentType?: string; classroomId?: string }>(req);
  const filename = need(b.filename, "filename is required");
  if (b.classroomId) await ownedClassroom(b.classroomId, teacher);
  const db = supabaseAdmin();
  const { data: lec, error } = await db
    .from("lectures")
    .insert({
      title: b.title?.trim() || filename.replace(/\.[^.]+$/, ""),
      source: "upload",
      media_type: b.contentType ?? null,
      classroom_id: b.classroomId || null,
      teacher_id: teacher.tid,
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

// GET /api/lectures?classroomId=&status=ready  → the signed-in teacher's recent lectures for the dashboard
export const GET = route(async (req: Request) => {
  const teacher = await requireTeacher();
  const u = new URL(req.url).searchParams;
  const db = supabaseAdmin();
  const { data: rooms } = await db.from("classrooms").select("id").eq("teacher_id", teacher.tid);
  const roomIds = (rooms ?? []).map((r) => r.id);
  let q = db
    .from("lectures")
    .select("id,title,source,status,progress,duration_s,class_id,classroom_id,media_type,created_at,error,classroom:classrooms(name,subject_code,room)");
  q = q.or([`teacher_id.eq.${teacher.tid}`, ...(roomIds.length ? [`classroom_id.in.(${roomIds.join(",")})`] : [])].join(","));
  if (u.get("classroomId")) q = q.eq("classroom_id", u.get("classroomId")!);
  if (u.get("status")) q = q.eq("status", u.get("status")!);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return ok({ lectures: data });
});
