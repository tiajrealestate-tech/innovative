import { NextRequest, NextResponse } from "next/server";

// -----------------------------------------------------------------------------
// Simple shared-password gate. Everything is protected except the login page,
// the login API, and Next.js static assets. If the auth cookie doesn't match
// APP_PASSWORD, the visitor is redirected to /login (or gets 401 for APIs).
// -----------------------------------------------------------------------------

const COOKIE = "vtr_auth";

const PUBLIC_PATHS = ["/login", "/api/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const expected = process.env.APP_PASSWORD;
  const cookie = req.cookies.get(COOKIE)?.value;

  // If no password is configured, don't lock the owner out — allow through.
  if (!expected || cookie === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and common static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
