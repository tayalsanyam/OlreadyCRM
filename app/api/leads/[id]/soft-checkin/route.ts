import { NextResponse } from "next/server";
import { withTransaction, appendComm, insertAuditLog } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { COMM } from "@/lib/comm-types";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    outcome: "olready" | "external" | "unknown";
    note?: string;
  };

  const { session } = auth;

  if (USE_MOCK) {
    mockStore.softCheckin(id, body.outcome, body.note, session.userId, session.name);
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  const lead = await getLeadForAccess(id);
  if (!lead || !canAccessLead(session, lead)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const descriptions = {
    olready: "Soft check-in: Booked via Olready",
    external: `Soft check-in: Booked externally${body.note ? ` — ${body.note}` : ""}`,
    unknown: "Soft check-in: Unknown / no response — marked missed",
  };

  await withTransaction(async (tx) => {
    await appendComm(tx, {
      leadId: id,
      entryType: COMM.softCheckin,
      description: descriptions[body.outcome],
      actorId: session.userId,
      metadata: { outcome: body.outcome, note: body.note },
    });
    if (body.outcome === "unknown") {
      await tx`
        UPDATE bride_leads SET status = 'missed', updated_at = NOW()
        WHERE id = ${id}::uuid
      `;
      await refreshLeadPhase(tx, id);
    }
    await insertAuditLog(tx, {
      tableName: "bride_leads",
      recordId: id,
      action: "soft_checkin",
      actorId: session.userId,
      changes: body,
    });
  });

  return NextResponse.json({ data: { ok: true }, error: null });
}
