// middleware.js
import { NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "./lib/auth";

export const config = {
  matcher: ["/((?!api/login|api/logout|login|_next/static|_next/image|favicon.ico).*)"],
};

export async function middleware(req) {
  const secret = process.env.SESSION_SECRET;
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (secret && (await verifySessionToken(secret, token))) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
