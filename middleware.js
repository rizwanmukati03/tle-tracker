// middleware.js
import { NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "./lib/auth";

// Everything matches EXCEPT: the login page, the login/logout API routes,
// and Next's static asset paths. That means / and /api/tle are both
// protected — the satellite data API can't be called directly without
// a valid session either.
export const config = {
  matcher: ["/((?!api/login|api/logout|login|_next/static|_next/image|favicon.ico).*)"],
};

export async function middleware(req) {
  const secret = process.env.SESSION_SECRET;
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (secret && (await verifySessionToken(secret, token))) {
    return NextResponse.next();
  }

  // API routes get a JSON 401 (so fetch() calls fail cleanly instead of
  // getting redirected HTML back as if it were JSON).
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pages get redirected to /login, remembering where they were headed.
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
