import { ok, route } from "@/lib/http";
import { listClasses } from "@/lib/classes";
import { ownedClassroom } from "@/lib/access";
import { requireTeacher } from "@/lib/auth";
import { HttpError } from "@/lib/http";

// GET /api/class?classroomId=&status=live&limit=20  → the signed-in teacher's classes in one classroom (newest first)
export const GET = route(async (req: Request) => {
  const teacher = await requireTeacher();
  const u = new URL(req.url).searchParams;
  const classroomId = u.get("classroomId");
  if (!classroomId) throw new HttpError(400, "classroomId is required");
  await ownedClassroom(classroomId, teacher);
  const classes = await listClasses({ status: u.get("status") ?? undefined, classroomId, limit: Math.min(100, Number(u.get("limit") ?? 20)) });
  return ok({ classes });
});
