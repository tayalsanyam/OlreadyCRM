import { NextResponse } from "next/server";
import { signIn } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json(
        { data: null, error: "Email and password required" },
        { status: 400 }
      );
    }
    const result = await signIn(body.email, body.password);
    if (!result.ok) {
      return NextResponse.json({ data: null, error: result.error }, { status: 401 });
    }
    return NextResponse.json({ data: { redirect: result.redirect }, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Login failed";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
