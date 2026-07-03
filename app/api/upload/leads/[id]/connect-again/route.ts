import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { logVerificationConnectAttempt } from "@/lib/lead-verification-connect";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { note?: string | null };

  if (USE_MOCK) {
    const result = mockStore.logVerificationConnectAttempt(id, auth.session.userId, body.note);
    if (!result) {
      return NextResponse.json({ data: null, error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ data: result, error: null });
  }

  try {
    const data = await withTransaction((tx) =>
      logVerificationConnectAttempt(tx, {
        leadId: id,
        staffId: auth.session.userId,
        note: body.note,
        actorId: auth.session.userId,
      }),
    );
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json(
      { data: null, error: e instanceof Error ? e.message : "Could not log connect attempt" },
      { status: 400 },
    );
  }
}
