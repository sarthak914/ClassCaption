import { NextResponse, type NextRequest } from "next/server";

/**
 * - Teacher pages need a teacher session: without the cookie, go to the sign-in page.
 *   (The API routes verify the cookie's signature themselves; this is only the redirect.)
 * - The API is same-origin only, except the health check.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/teacher") && pathname !== "/teacher/login" && !req.cookies.has("cc_teacher")) {
    const url = req.nextUrl.clone();
    url.pathname = "/teacher/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  if (pathname === "/api/health") {
    const res = req.method === "OPTIONS" ? new NextResponse(null, { status: 204 }) : NextResponse.next();
    res.headers.set("access-control-allow-origin", "*");
    return res;
  }
  return NextResponse.next();
}

export const config = { matcher: ["/teacher/:path*", "/api/health"] };
