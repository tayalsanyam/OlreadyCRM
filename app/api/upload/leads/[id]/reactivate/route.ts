import { NextResponse } from "next/server";
import { withTransaction, insertAuditLog } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { reactivateNiLead } from "@/lib/lead-reactivate";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { note?: string | null };
  const { session } = auth;

  if (USE_MOCK) {
    const ok = mockStore.reactivateNiLead(id, session.userId, session.name, body.note ?? null);
    if (!ok) {
      return NextResponse.json(
        { data: null, error: "This lead cannot be reactivated from closed" },
        { status: 400 }
      );
    }
    return NextResponse.json({ data: { id, status: "verified" }, error: null });
  }

  try {
    const result = await withTransaction(async (tx) => {
      const reactivated = await reactivateNiLead(tx, {
        leadId: id,
        actorId: session.userId,
        actorName: session.name,
        note: body.note ?? null,
      });

      if (!reactivated.ok) {
        return {
          ok: false as const,
          error: reactivated.error,
          status: reactivated.error === "Lead not found" ? 404 : 400,
        };
      }

      await insertAuditLog(tx, {
        tableName: "bride_leads",
        recordId: id,
        action: "reactivate_ni",
        actorId: session.userId,
        changes: { note: body.note ?? null },
      });

      return { ok: true as const };
    });

    if (!result.ok) {
      return NextResponse.json(
        { data: null, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ data: { id, status: "verified" }, error: null });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ data: null, error: "Failed to reactivate lead" }, { status: 500 });
  }
}
