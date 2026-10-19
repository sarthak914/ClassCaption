import "server-only";
import { supabaseAdmin } from "./supabase/server";
import { HttpError } from "./http";
import { getStudent, getTeacher, requireTeacher, type StudentSession, type TeacherSession } from "./auth";
import { getClass, type ClassRow, type ClassroomRow } from "./classes";

/** Who may see a classroom's live classes and lectures: its teacher, or a student who joined it with the PIN. */
export type Viewer = { role: "teacher"; teacher: TeacherSession } | { role: "student"; student: StudentSession };

export async function ownedClassroom(classroomId: string, teacher?: TeacherSession): Promise<ClassroomRow> {
  const t = teacher ?? (await requireTeacher());
  const { data, error } = await supabaseAdmin().from("classrooms").select("*").eq("id", classroomId).maybeSingle();
  if (error) throw error;
  if (!data || data.teacher_id !== t.tid) throw new HttpError(404, "Classroom not found");
  return data;
}

/** Teacher who owns the classroom, or a student enrolled in it. Anyone else gets 401/403. */
export async function viewerOf(classroom: { id: string; teacher_id: string | null } | null | undefined): Promise<Viewer> {
  const [teacher, student] = await Promise.all([getTeacher(), getStudent()]);
  if (classroom && teacher && classroom.teacher_id === teacher.tid) return { role: "teacher", teacher };
  if (classroom && student?.rooms.includes(classroom.id)) return { role: "student", student };
  if (!teacher && !student) throw new HttpError(401, "Join your class with its PIN first");
  throw new HttpError(403, "You have not joined this classroom");
}

export async function classForViewer(classId: string) {
  const cls = await getClass(classId);
  return { cls, viewer: await viewerOf(cls.classroom) };
}

/** The class, if the signed-in teacher owns its classroom. */
export async function classForTeacher(classId: string): Promise<{ cls: ClassRow; teacher: TeacherSession }> {
  const teacher = await requireTeacher();
  const cls = await getClass(classId);
  if (cls.classroom?.teacher_id !== teacher.tid) throw new HttpError(404, "Class not found");
  return { cls, teacher };
}

/** Lectures belong to a classroom (or, for uploads without one, directly to a teacher). */
export async function lectureViewer(lec: { teacher_id?: string | null; classroom?: { id: string; teacher_id: string | null } | null }) {
  if (lec.classroom) return viewerOf(lec.classroom);
  const teacher = await getTeacher();
  if (teacher && lec.teacher_id === teacher.tid) return { role: "teacher", teacher } as Viewer;
  throw new HttpError(teacher ? 404 : 401, teacher ? "Lecture not found" : "Sign in to see this lecture");
}
