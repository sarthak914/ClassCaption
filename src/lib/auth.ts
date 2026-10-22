import "server-only";
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { HttpError } from "./http";

/**
 * Sessions are signed cookies (HMAC-SHA256), so no session table is needed.
 *   cc_teacher: { tid }                  set by /api/auth/login or /signup
 *   cc_student: { sid, name, rooms[], acct? }  set by /api/class/join (rooms = classroom ids joined with a PIN)
 *                                              or /api/auth/student/*; acct = true when sid is a students.id
 * The browser can't read or forge them (HttpOnly + signature); SameSite=Lax blocks cross-site POSTs.
 */
const TEACHER_COOKIE = "cc_teacher";
const STUDENT_COOKIE = "cc_student";
const TEACHER_TTL_S = 7 * 24 * 3600;
const STUDENT_TTL_S = 120 * 24 * 3600;

export type TeacherSession = { tid: string };
export type StudentSession = { sid: string; name: string; rooms: string[]; acct?: boolean };

function secret() {
  // SESSION_SECRET is optional: by default derive one from the service-role key, which is already secret.
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Missing SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY");
  return createHash("sha256").update(`classcaption-session:${s}`).digest();
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signToken(payload: object, ttlS: number) {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlS }));
  return `${body}.${b64(createHmac("sha256", secret()).update(body).digest())}`;
}

export function verifyToken<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", secret()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    return data as T;
  } catch {
    return null;
  }
}

// Passwords ----------------------------------------------------------------
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${b64(salt)}$${b64(await scrypt(pw, salt, 32))}`;
}

export async function checkPassword(pw: string, stored: string) {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = await scrypt(pw, Buffer.from(salt, "base64url"), want.length);
  return timingSafeEqual(got, want);
}

// Cookies ------------------------------------------------------------------
const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge,
  // Only mark Secure on https, so the app keeps working over http://<laptop IP> on a LAN.
  secure: process.env.COOKIE_SECURE === "true",
});

export function setTeacherCookie(res: NextResponse, s: TeacherSession) {
  res.cookies.set(TEACHER_COOKIE, signToken(s, TEACHER_TTL_S), cookieOpts(TEACHER_TTL_S));
}
export function setStudentCookie(res: NextResponse, s: StudentSession) {
  res.cookies.set(STUDENT_COOKIE, signToken(s, STUDENT_TTL_S), cookieOpts(STUDENT_TTL_S));
}
export function clearCookies(res: NextResponse, which: "teacher" | "student") {
  res.cookies.set(which === "teacher" ? TEACHER_COOKIE : STUDENT_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
}

export async function getTeacher(): Promise<TeacherSession | null> {
  return verifyToken<TeacherSession>((await cookies()).get(TEACHER_COOKIE)?.value);
}
export async function getStudent(): Promise<StudentSession | null> {
  return verifyToken<StudentSession>((await cookies()).get(STUDENT_COOKIE)?.value);
}

export async function requireTeacher(): Promise<TeacherSession> {
  const t = await getTeacher();
  if (!t) throw new HttpError(401, "Please sign in as a teacher");
  return t;
}
export async function requireStudent(): Promise<StudentSession> {
  const s = await getStudent();
  if (!s) throw new HttpError(401, "Join your class with its PIN first");
  return s;
}

export const newStudentId = () => b64(randomBytes(9));

/** Best-effort client address for rate limits (behind a proxy, the first x-forwarded-for hop). */
export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
