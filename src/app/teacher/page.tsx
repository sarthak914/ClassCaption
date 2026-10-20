import { redirect } from "next/navigation";

// /teacher on its own goes to the dashboard (the middleware sends signed-out visitors to the sign-in page first).
export default function TeacherIndex() {
  redirect("/teacher/dashboard");
}
