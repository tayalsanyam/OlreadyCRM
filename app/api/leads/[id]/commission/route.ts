import { NextResponse } from "next/server";
import { sql, withTransaction, appendComm, insertAuditLog } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { COMM } from "@/lib/comm-types";
import { normalizeLeadFull } from "@/lib/db-mappers";
import type { LeadFull } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (auth.session.role !== "commissionRm" && auth.session.role !== "admin" && auth.session.role !== "owner") {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    commissionOffered?: number | null;
    commissionAgreed?: number | null;
  };

  if (USE_MOCK) {
    const lead = mockStore.updateCommissionFollowUp(id, body, auth.session.userId, auth.session.name);
    if (!lead) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: lead, error: null });
  }

  const accessRow = await getLeadForAccess(id);
  if (!accessRow) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }
  if (!canAccessLead(auth.session, accessRow)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const [locked] = await sql<{ status: string }[]>`
    SELECT status::text AS status FROM bride_leads WHERE id = ${id}::uuid
  `;
  if (locked?.status === "booked") {
    return NextResponse.json(
      { data: null, error: "Commission amounts are locked after booking is confirmed" },
      { status: 400 }
    );
  }
  if (locked?.status !== "commission_rm") {
    return NextResponse.json(
      { data: null, error: "Lead is not in commission queue" },
      { status: 400 }
    );
  }

  await withTransaction(async (tx) => {
    if (body.commissionOffered !== undefined) {
      await tx`
        UPDATE bride_leads SET
          commission_offered = ${body.commissionOffered},
          updated_at = NOW()
        WHERE id = ${id}::uuid
      `;
    }
    if (body.commissionAgreed !== undefined) {
      await tx`
        UPDATE bride_leads SET
          commission_agreed = ${body.commissionAgreed},
          updated_at = NOW()
        WHERE id = ${id}::uuid
      `;
    }

    const parts: string[] = [];
    if (body.commissionOffered !== undefined) {
      parts.push(
        `Commission offered: ${body.commissionOffered != null ? `Rs. ${body.commissionOffered}` : "cleared"}`
      );
    }
    if (body.commissionAgreed !== undefined) {
      parts.push(
        `Commission agreed: ${body.commissionAgreed != null ? `Rs. ${body.commissionAgreed}` : "cleared"}`
      );
    }
    if (parts.length) {
      await appendComm(tx, {
        leadId: id,
        entryType: COMM.note,
        description: parts.join(". "),
        actorId: auth.session.userId,
      });
    }

    await insertAuditLog(tx, {
      tableName: "bride_leads",
      recordId: id,
      action: "commission_follow_up",
      actorId: auth.session.userId,
      changes: body,
    });
  });

  const [lead] = await sql<LeadFull[]>`
    SELECT * FROM leads_full WHERE id = ${id}::uuid
  `;
  return NextResponse.json({
    data: lead ? normalizeLeadFull(lead) : null,
    error: null,
  });
}
