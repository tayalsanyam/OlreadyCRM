import { NextResponse } from "next/server";
import { sql, appendComm } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { COMM } from "@/lib/comm-types";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    portalPushed?: boolean;
    portalCap?: number | null;
  };

  if (body.portalPushed === undefined) {
    return NextResponse.json(
      { data: null, error: "portalPushed required" },
      { status: 400 }
    );
  }

  const { session } = auth;

  if (USE_MOCK) {
    mockStore.updateLeadPortal(id, body.portalPushed, body.portalCap ?? null);
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  const lead = await getLeadForAccess(id);
  if (!lead || !canAccessLead(session, lead)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  if (
    session.role === "regionalRm" &&
    lead.assignedRmId !== session.userId
  ) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  if (!["admin", "owner", "regionalRm"].includes(session.role)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  await sql`
    UPDATE bride_leads SET
      portal_pushed = ${body.portalPushed},
      portal_pushed_at = ${body.portalPushed ? sql`NOW()` : null},
      portal_cap = ${body.portalCap ?? null},
      updated_at = NOW()
    WHERE id = ${id}::uuid
  `;

  await appendComm(sql, {
    leadId: id,
    entryType: COMM.note,
    description: body.portalPushed
      ? "Listed on olready.in portal"
      : "Removed from olready.in portal",
    actorId: session.userId,
  });

  return NextResponse.json({ data: { ok: true }, error: null });
}
