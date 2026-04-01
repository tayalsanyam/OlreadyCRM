import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = ["/login", "/api/auth/login", "/api/auth/me", "/api/setup", "/api/setup/check"];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC.some((p) => path.startsWith(p))) return NextResponse.next();
  const cookie = request.cookies.get("olready_session")?.value;
  if (!cookie && !path.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|favicon).*)"] };
