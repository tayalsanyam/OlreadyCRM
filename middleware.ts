import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import type { UserRole } from "@/lib/types";
import { ROLE_HOME } from "@/lib/types";

const PROTECTED_PREFIXES = [
  "/rm",
  "/commission",
  "/upload",
  "/feedback",
  "/care",
  "/crm",
  "/sales",
  "/activation",
  "/tasks",
  "/admin",
  "/owner",
];

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) return new TextEncoder().encode("dev-secret");
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get("olready_access")?.value;
  if (!token) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as UserRole;

    const rmLeadProfile = pathname.startsWith("/rm/leads/");
    const rmShared =
      rmLeadProfile ||
      pathname === "/rm/tasks" ||
      pathname === "/feedback/tasks";
    if (pathname.startsWith("/rm") && role !== "regionalRm") {
      const allowed =
        (role === "commissionRm" && rmShared) ||
        (role === "feedbackRm" && rmShared) ||
        ((role === "admin" || role === "owner" || role === "careAgent") &&
          rmLeadProfile);
      if (!allowed) {
        return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
      }
    }
    if (pathname.startsWith("/commission") && role !== "commissionRm") {
      return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
    }
    if (pathname.startsWith("/feedback") && role !== "feedbackRm") {
      return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
    }
    if (pathname.startsWith("/care") || pathname.startsWith("/crm")) {
      const allowed =
        role === "careAgent" ||
        role === "admin" ||
        role === "owner";
      if (!allowed) {
        return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
      }
    }
    if (pathname.startsWith("/sales")) {
      const allowed =
        role === "salesRm" ||
        role === "salesTl" ||
        role === "admin" ||
        role === "owner";
      if (!allowed) {
        return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
      }
      if (pathname === "/sales/rejected" && role === "salesTl") {
        return NextResponse.redirect(new URL(ROLE_HOME.salesTl, request.url));
      }
    }
    if (pathname.startsWith("/activation")) {
      const allowed = role === "salesActivation" || role === "admin";
      if (!allowed) {
        return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
      }
    }
    if (pathname.startsWith("/upload") && role !== "leadUploader") {
      return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
    }
    if (
      pathname.startsWith("/admin") &&
      role !== "admin" &&
      role !== "owner"
    ) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
    }
    if (pathname.startsWith("/owner") && role !== "owner") {
      return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
    }

    return NextResponse.next();
  } catch {
    const login = new URL("/login", request.url);
    return NextResponse.redirect(login);
  }
}

export const config = {
  matcher: [
    "/rm/:path*",
    "/commission/:path*",
    "/upload/:path*",
    "/feedback/:path*",
    "/care/:path*",
    "/crm/:path*",
    "/sales/:path*",
    "/activation/:path*",
    "/tasks/:path*",
    "/admin/:path*",
    "/owner/:path*",
    "/login",
  ],
};
