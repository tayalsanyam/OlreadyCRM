import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireActivationAccess } from "@/lib/api-auth";
import { syncActivationContractReminders } from "@/lib/sales-activation-contract-reminder";
import { syncActivationSendBackFollowUps } from "@/lib/sales-activation-send-back-reminder";

export async function GET() {
  const auth = await requireActivationAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await withTransaction(async (tx) => {
    await syncActivationContractReminders(tx);
    await syncActivationSendBackFollowUps(tx);
    return tx`
      SELECT
        p.id,
        p.mua_type AS "muaType",
        m.name AS "muaName",
        m.city AS "muaCity",
        assignee.name AS "assignedSalesName",
        tr.updated_at AS "trainingCompletedAt",
        DATE_PART('day', NOW() - tr.updated_at)::int AS "daysSinceTraining"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      JOIN sales.training tr ON tr.pipeline_id = p.id AND tr.complete = true
      LEFT JOIN sales.activation_log al ON al.pipeline_id = p.id
      LEFT JOIN staff assignee ON assignee.id = p.assigned_to
      WHERE (al.activated_at IS NULL)
      ORDER BY tr.updated_at ASC
    `;
  });

  return NextResponse.json({ data: rows, error: null });
}
