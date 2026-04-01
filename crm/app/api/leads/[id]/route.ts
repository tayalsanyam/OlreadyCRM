import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { getLeadById, updateLead } from "@/lib/leads";
import { createTask } from "@/lib/tasks";
import { addActivity } from "@/lib/activity";
import { getCustomerByLeadId } from "@/lib/customers";
import { getSubscriptionsByLeadId } from "@/lib/subscriptions";
import { isSupabaseConfigured } from "@/lib/supabase";

async function canAccessLead(
  session: { user?: { role: string; assigned_bdm?: string; team_id?: string } },
  leadBdm: string
): Promise<boolean> {
  if (!session.user) return false;
  if (session.user.role === "admin") return true;
  if (session.user.role === "bdm") return session.user.assigned_bdm === leadBdm;
  if (session.user.role === "team_leader" && session.user.team_id) {
    const bdms = await getBdmsForTeam(session.user.team_id);
    return bdms.includes(leadBdm);
  }
  return false;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const lead = await getLeadById(id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ok = await canAccessLead(session, lead.bdm);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const res: Record<string, unknown> = { ...lead };
  if (isSupabaseConfigured()) {
    const [customer, subs] = await Promise.all([
      getCustomerByLeadId(id),
      getSubscriptionsByLeadId(id),
    ]);
    res.customer = customer;
    const today = new Date().toISOString().slice(0, 10);
    const activeSubs = subs.filter((s) => s.plan_end_date >= today).sort((a, b) => a.plan_end_date.localeCompare(b.plan_end_date));
    const activeSub = activeSubs[0];
    if (activeSub) {
      res.leadType = "on_plan";
      res.planExpiry = activeSub.plan_end_date;
      res.activePlanName = activeSub.plan_name;
      res.activeOpsCoordinator = activeSub.ops_coordinator ?? null;
    } else if (customer) {
      res.leadType = "existing_customer";
    } else {
      res.leadType = "new";
    }
  }
  return NextResponse.json(res);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await getLeadById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ok = await canAccessLead(session, existing.bdm);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const prevFollowUp = existing.next_follow_up;
  const updates: Record<string, unknown> = {};
  const fields = [
    "name", "city", "company", "email", "phone", "insta_id",
    "bdm", "plan", "status", "remarks", "lost_reason", "connected_on", "next_follow_up",
    "committed_date", "original_price", "discount", "source",
  ];
  // Allow all payment-related fields for editing selling price (original_price, discount)
  for (const f of fields) {
    if (body[f] !== undefined) (updates as Record<string, unknown>)[f] = body[f];
  }
  if (Object.keys(updates).length === 0) return NextResponse.json(existing);

  const effectiveStatus = (updates.status as string) ?? existing.status;
  const requiresFollowUp = ["FOLLOW UP/DETAILS SHARED", "CONFIRMED", "PARTLY_PAID"].includes(effectiveStatus);
  const nextFollowUp = (updates.next_follow_up as string) ?? existing.next_follow_up;
  if (requiresFollowUp && !nextFollowUp?.trim()) {
    return NextResponse.json(
      { error: "Next Follow Up is required when status is FOLLOW UP/DETAILS SHARED, CONFIRMED or PARTLY_PAID" },
      { status: 400 }
    );
  }
  const lostReason = (updates.lost_reason as string) ?? existing.lost_reason;
  if (effectiveStatus === "DENIED" && !lostReason?.trim()) {
    return NextResponse.json(
      { error: "Lost reason is required when status is DENIED" },
      { status: 400 }
    );
  }

  let updated;
  try {
    updated = await updateLead(id, updates);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  if (updates.next_follow_up && updates.next_follow_up !== prevFollowUp) {
    await createTask({
      title: `Follow up: ${updated.name}`,
      due: String(updates.next_follow_up),
      assignee: updated.bdm,
      done: false,
      lead_id: id,
    });
  }

  const note = [
    updates.status && `Status: ${updates.status}`,
    updates.status === "DENIED" && updates.lost_reason && `Lost reason: ${updates.lost_reason}`,
    updates.next_follow_up && `Pending payment follow-up: ${updates.next_follow_up}`,
    updates.remarks,
  ].filter(Boolean).join(". ");
  await addActivity(id, "Updated", session.user!.username, note, {
    status: updates.status as string,
    remarks: updates.remarks as string,
    next_connect: updates.next_follow_up as string,
  });

  return NextResponse.json(updated);
}
