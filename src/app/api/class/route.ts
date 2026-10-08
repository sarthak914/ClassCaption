import { ok, route } from "@/lib/http";
import { listClasses } from "@/lib/classes";

// GET /api/class?status=live&classroomId=&limit=20  → recent classes (newest first), with their classroom
export const GET = route(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  const classes = await listClasses({
    status: u.get("status") ?? undefined,
    classroomId: u.get("classroomId") ?? undefined,
    limit: Number(u.get("limit") ?? 20),
  });
  return ok({ classes });
});
