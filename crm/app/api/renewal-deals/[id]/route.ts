import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { getLeadById } from "@/lib/leads";
import { getRenewalDealById, updateRenewalDeal, getRenewalDealSellingPrice, getRenewalDealBalance } from "@/lib/renewal-deals";
import { createTask } from "@/lib/tasks";

async function canAccessLead(
  session: { user?: { role: string; assigned_bdm?: string; team_id?: string } },
  leadBdm: string
): Promise<boolean> {
  if (!session.user) return false;
  if (session.user.role === "admin") return true;
  if (session.user.role === "bdm") return session.user.assigned_bdm === leadBdm;
  if (session.user.role === "team_leader" && session.user.team_id) {
    const { getBdmsForTeam } = await import("@/lib/teams");
    const bdms = await getBdmsForTeam(session.user.team_id);
    return bdms.includes(leadBdm);
  }
  return false;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deal = await getRenewalDealById(id);
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const lead = await getLeadById(deal.lead_id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const ok = await canAccessLead(session, lead.bdm);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.status === "CONFIRMED" && !body.committed_date?.trim()) {
    return NextResponse.json({ error: "Committed date is required to move to pending payment" }, { status: 400 });
  }
  if (body.status === "RENEWAL_REJECTED" && !body.rejection_reason?.trim()) {
    return NextResponse.json({ error: "Rejection reason is required when rejecting a renewal" }, { status: 400 });
  }
  if (body.next_follow_up !== undefined) updates.next_follow_up = body.next_follow_up?.trim().slice(0, 10) || null;
  if (body.committed_date !== undefined) updates.committed_date = body.committed_date?.trim().slice(0, 10) || null;
  if (body.rejection_reason !== undefined) updates.rejection_reason = body.rejection_reason?.trim() || null;
  if (body.original_price !== undefined) updates.original_price = body.original_price != null ? Number(body.original_price) : null;
  if (body.discount !== undefined) updates.discount = body.discount != null ? Number(body.discount) : 0;

  const updated = await updateRenewalDeal(id, updates);
  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  const followUpVal = updates.next_follow_up as string | undefined;
  if (followUpVal && lead) {
    await createTask({
      title: `Renewal follow-up: ${lead.name}`,
      due: String(followUpVal),
      assignee: lead.bdm,
      done: false,
      lead_id: deal.lead_id,
      renewal_deal_id: id,
    });
  }

  return NextResponse.json({
    ...updated,
    selling_price: getRenewalDealSellingPrice(updated),
    balance: getRenewalDealBalance(updated),
  });
}
