import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { syncActivationContractReminders } from "@/lib/sales-activation-contract-reminder";
import { syncActivationSendBackFollowUps } from "@/lib/sales-activation-send-back-reminder";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const data = await withTransaction(async (tx) => {
    await syncActivationContractReminders(tx);
    await syncActivationSendBackFollowUps(tx);

    const pending = await tx<
      {
        id: string;
        muaName: string;
        muaCity: string;
        muaType: string;
        assignedSalesName: string | null;
        salesClosedByName: string | null;
        trainingCompletedAt: string;
        daysPending: number;
        plan: string | null;
        leadCap: number | null;
        leadBudget: string | null;
        durationStart: string | null;
        durationEnd: string | null;
        quotedAmount: number | null;
        profileLinkVerified: boolean;
        invoiceGenerated: boolean;
        contractGenerated: boolean;
        hasContract: boolean;
      }[]
    >`
      SELECT
        p.id,
        m.name AS "muaName",
        m.city AS "muaCity",
        p.mua_type AS "muaType",
        assignee.name AS "assignedSalesName",
        closed.name AS "salesClosedByName",
        tr.updated_at AS "trainingCompletedAt",
        DATE_PART('day', NOW() - tr.updated_at)::int AS "daysPending",
        o.plan,
        o.lead_cap AS "leadCap",
        o.lead_budget AS "leadBudget",
        o.duration_start AS "durationStart",
        o.duration_end AS "durationEnd",
        o.quoted_amount AS "quotedAmount",
        COALESCE(al.profile_link_verified, false) AS "profileLinkVerified",
        COALESCE(al.invoice_generated, false) AS "invoiceGenerated",
        COALESCE(al.contract_generated, false) AS "contractGenerated",
        COALESCE(BTRIM(al.contract_url) <> '', false) AS "hasContract"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      JOIN sales.training tr ON tr.pipeline_id = p.id AND tr.complete = true
      LEFT JOIN sales.onboarding o ON o.pipeline_id = p.id
      LEFT JOIN sales.activation_log al ON al.pipeline_id = p.id
      LEFT JOIN staff assignee ON assignee.id = p.assigned_to
      LEFT JOIN staff closed ON closed.id = p.sales_closed_by
      WHERE al.activated_at IS NULL
        AND al.sent_back_at IS NULL
      ORDER BY tr.updated_at ASC
    `;

    const sentBack = await tx<
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
        plan: string | null;
        leadCap: number | null;
        leadBudget: string | null;
        durationStart: string | null;
        durationEnd: string | null;
        quotedAmount: number | null;
        salesTaskPending: boolean;
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
        o.plan,
        o.lead_cap AS "leadCap",
        o.lead_budget AS "leadBudget",
        o.duration_start AS "durationStart",
        o.duration_end AS "durationEnd",
        o.quoted_amount AS "quotedAmount",
        EXISTS (
          SELECT 1
          FROM rm_tasks t
          WHERE t.status = 'pending'
            AND t.task_type = 'sales_follow_up'
            AND t.title LIKE '%Activation send-back%'
            AND t.title LIKE ('%[PIPE:' || p.id::text || ']%')
        ) AS "salesTaskPending"
      FROM sales.activation_log al
      JOIN sales.pipeline p ON p.id = al.pipeline_id
      JOIN muas m ON m.id = p.mua_id
      JOIN sales.training tr ON tr.pipeline_id = al.pipeline_id
      LEFT JOIN sales.onboarding o ON o.pipeline_id = p.id
      LEFT JOIN staff assignee ON assignee.id = p.assigned_to
      LEFT JOIN staff closed ON closed.id = p.sales_closed_by
      WHERE al.sent_back_at IS NOT NULL
        AND al.activated_at IS NULL
        AND tr.complete = false
      ORDER BY al.sent_back_at ASC
    `;

    return { pending, sentBack };
  });

  return NextResponse.json({ data, error: null });
}
