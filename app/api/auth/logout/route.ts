import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

export async function POST() {
  await signOut();
  return NextResponse.json({ data: { ok: true }, error: null });
}

/** Clear session cookie and return to login (use after switching mock → live DB). */
export async function GET(request: Request) {
  await signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}
