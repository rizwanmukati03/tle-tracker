// middleware.js
// true  = whole site (pages, data endpoints, cron) returns a plain 404
// false = site runs normally
import { NextResponse } from "next/server";

const SITE_HIDDEN = true;

const NOT_FOUND_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>404: This page could not be found</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff;color:#000;font-family:system-ui,sans-serif;text-align:center;">
  <div>
    <h1 style="display:inline-block;margin:0 20px 0 0;padding-right:23px;border-right:1px solid rgba(0,0,0,.3);font-size:24px;font-weight:500;line-height:49px;">404</h1>
    <h2 style="display:inline-block;font-size:14px;font-weight:400;line-height:49px;margin:0;">This page could not be found.</h2>
  </div>
</body>
</html>`;

export function middleware() {
  if (SITE_HIDDEN) {
    return new NextResponse(NOT_FOUND_PAGE, {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.next();
}
