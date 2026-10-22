import "server-only";
import { supabaseAdmin } from "./supabase/server";
import type { StudentSession } from "./auth";

export type StudentRow = { id: string; name: string; email: string; roll_no: string | null; created_at: string };

/** Classrooms a student account is enrolled in, newest first. */
export async function enrolledRooms(studentId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin()
    .from("enrollments")
    .select("classroom_id,joined_at")
    .eq("student_id", studentId)
    .order("joined_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => r.classroom_id);
}

export async function enroll(studentId: string, classroomIds: string[]) {
  if (!classroomIds.length) return;
  const { error } = await supabaseAdmin()
    .from("enrollments")
    .upsert(classroomIds.map((classroom_id) => ({ student_id: studentId, classroom_id })), { onConflict: "student_id,classroom_id", ignoreDuplicates: true });
  if (error) throw error;
}

/**
 * The classrooms this student may open. For an account that is everything it enrolled in from any device;
 * for a device pass it is the rooms on the pass.
 */
export async function roomsOf(s: StudentSession): Promise<string[]> {
  if (!s.acct) return s.rooms;
  const db = await enrolledRooms(s.sid).catch(() => [] as string[]);
  return [...new Set([...s.rooms, ...db])];
}

/** The cookie for a signed-in account: its enrolled rooms, plus any rooms this device had joined as a guest. */
export async function accountSession(student: { id: string; name: string }, guest?: StudentSession | null): Promise<StudentSession> {
  const guestRooms = guest && !guest.acct ? guest.rooms : [];
  await enroll(student.id, guestRooms);
  const rooms = await enrolledRooms(student.id);
  return { sid: student.id, name: student.name, rooms: rooms.slice(0, 50), acct: true };
}
