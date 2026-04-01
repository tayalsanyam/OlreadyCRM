import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Page routes only — `/api/*` is excluded in `matcher` (auth lives in API routes). */
const PUBLIC_PREFIXES = ["/login"];

export function middleware(request: NextRequest) {
  try {
    const path = request.nextUrl.pathname;
    if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      return NextResponse.next();
    }
    const cookie = request.cookies.get("olready_session")?.value;
    if (!cookie) {
      return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
    }
    return NextResponse.next();
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/", "/((?!api/|_next/|favicon\\.ico|.*\\..*).+)"],
};
