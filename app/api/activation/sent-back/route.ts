import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireActivationAccess } from "@/lib/api-auth";
import { syncActivationSendBackFollowUps } from "@/lib/sales-activation-send-back-reminder";

export async function GET() {
  const auth = await requireActivationAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await withTransaction(async (tx) => {
    await syncActivationSendBackFollowUps(tx);

    return tx<
      {
        id: string;
        muaName: string;
        muaCity: string;
        muaType: string;
        assignedSalesName: string | null;
        salesClosedByName: string | null;
        sentBackAt: string;
        sentBackNote: string | null;
        daysSinceSendBack: number;
        salesTaskPending: boolean;
        activationFollowUpPending: boolean;
      }[]
    >`
      SELECT
        p.id,
        m.name AS "muaName",
        m.city AS "muaCity",
        p.mua_type AS "muaType",
        assignee.name AS "assignedSalesName",
        closed.name AS "salesClosedByName",
        al.sent_back_at AS "sentBackAt",
        al.sent_back_note AS "sentBackNote",
        DATE_PART('day', NOW() - al.sent_back_at)::int AS "daysSinceSendBack",
        EXISTS (
          SELECT 1
          FROM rm_tasks t
          WHERE t.status = 'pending'
            AND t.task_type = 'sales_follow_up'
            AND t.title LIKE '%Activation send-back%'
            AND t.title LIKE ('%[PIPE:' || p.id::text || ']%')
        ) AS "salesTaskPending",
        EXISTS (
          SELECT 1
          FROM rm_tasks t
          WHERE t.status = 'pending'
            AND t.task_type = 'sales_activation'
            AND t.title LIKE '%Send-back follow-up%'
            AND t.title LIKE ('%[PIPE:' || p.id::text || ']%')
        ) AS "activationFollowUpPending"
      FROM sales.activation_log al
      JOIN sales.pipeline p ON p.id = al.pipeline_id
      JOIN muas m ON m.id = p.mua_id
      JOIN sales.training tr ON tr.pipeline_id = al.pipeline_id
      LEFT JOIN staff assignee ON assignee.id = p.assigned_to
      LEFT JOIN staff closed ON closed.id = p.sales_closed_by
      WHERE al.sent_back_at IS NOT NULL
        AND al.activated_at IS NULL
        AND tr.complete = false
      ORDER BY al.sent_back_at ASC
    `;
  });

  return NextResponse.json({ data: rows, error: null });
}
