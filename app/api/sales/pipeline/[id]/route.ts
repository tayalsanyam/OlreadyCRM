import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireSalesOrActivationAccess } from "@/lib/api-auth";
import { fromDbPlanTier, fromDbTaskType } from "@/lib/db-mappers";
import { fetchMuaRegions } from "@/lib/mua-regions-db";
import { assertPipelineAccess } from "@/lib/sales-pipeline-access";
import { loadPipelineQuotedAmount, sumPipelinePayments } from "@/lib/sales-deal-payment";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesOrActivationAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
  const data = await withTransaction(async (tx) => {
    await assertPipelineAccess(tx, auth.session, id);

    const [pipeline] = await tx`
      SELECT
        p.id,
        p.mua_id AS "muaId",
        p.mua_type AS "muaType",
        p.stage,
        p.status,
        p.assigned_to AS "assignedTo",
        p.sales_closed_by AS "salesClosedBy",
        p.priority_tag AS "priorityTag",
        p.sales_notes AS "salesNotes",
        p.preferred_contact_time AS "preferredContactTime",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        DATE_PART('day', NOW() - p.updated_at)::int AS "daysInStage",
        m.name AS "muaName",
        m.city AS "muaCity",
        m.source AS "muaSource",
        m.phone AS "muaPhone",
        COALESCE(
          NULLIF(BTRIM(m.email), ''),
          (
            SELECT NULLIF(BTRIM(o.email), '')
            FROM sales.onboarding o
            WHERE o.pipeline_id = p.id
            LIMIT 1
          )
        ) AS "muaEmail",
        m.whatsapp,
        m.instagram,
        m.preferred_contact_channel AS "preferredContactChannel",
        a.name AS "assignedToName",
        sc.name AS "salesClosedByName"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      LEFT JOIN staff a ON a.id = p.assigned_to
      LEFT JOIN staff sc ON sc.id = p.sales_closed_by
      WHERE p.id = ${id}::uuid
      LIMIT 1
    `;
    if (!pipeline) return null;

    const muaRegions = await fetchMuaRegions(pipeline.muaId as string);

    const lastContact = await tx<{ at: string | null }[]>`
      SELECT MAX(created_at)::text AS at
      FROM (
        SELECT created_at FROM sales.comms_log WHERE pipeline_id = ${id}::uuid
        UNION ALL
        SELECT called_at AS created_at FROM sales.call_logs WHERE pipeline_id = ${id}::uuid
      ) t
    `;
    const daysSinceLastContact =
      lastContact[0]?.at != null
        ? Math.floor((Date.now() - new Date(lastContact[0].at).getTime()) / 86400000)
        : null;

    const stageLog = await tx`
      SELECT sl.*, s.name AS "changedByName"
      FROM sales.stage_log sl
      LEFT JOIN staff s ON s.id = sl.changed_by
      WHERE sl.pipeline_id = ${id}::uuid
      ORDER BY sl.created_at DESC
      LIMIT 20
    `;
    const pipelineRef = `%[PIPE:${id}]%`;
    const tasks = (
      await tx`
      SELECT id, display_id AS "displayId", title, task_type AS "taskType", due_date AS "dueDate", status
      FROM rm_tasks
      WHERE status = 'pending'
        AND title LIKE ${pipelineRef}
      ORDER BY due_date NULLS LAST, created_at DESC
      LIMIT 20
    `
    ).map((t: { taskType: string; [key: string]: unknown }) => ({
      ...t,
      taskType: fromDbTaskType(String(t.taskType)),
    }));
    const [payment] = await tx`SELECT * FROM sales.payment_records WHERE pipeline_id = ${id}::uuid ORDER BY created_at DESC LIMIT 1`;
    const totalPaid = await sumPipelinePayments(tx, id);
    const quotedAmount = await loadPipelineQuotedAmount(tx, id);
    const [onboarding] = await tx`SELECT * FROM sales.onboarding WHERE pipeline_id = ${id}::uuid`;
    const [training] = await tx`SELECT * FROM sales.training WHERE pipeline_id = ${id}::uuid`;
    const [activationRow] = await tx<{
      profile_link_verified: boolean;
      invoice_generated: boolean;
      invoice_number: string | null;
      contract_generated: boolean;
      contract_url: string | null;
      sent_back_at: string | null;
      sent_back_note: string | null;
      activated_at: string | null;
    }[]>`
      SELECT
        profile_link_verified,
        invoice_generated,
        invoice_number,
        contract_generated,
        contract_url,
        sent_back_at,
        sent_back_note,
        activated_at
      FROM sales.activation_log
      WHERE pipeline_id = ${id}::uuid
    `;
    const activation = activationRow
      ? {
          profileLinkVerified: activationRow.profile_link_verified,
          invoiceGenerated: activationRow.invoice_generated,
          invoiceNumber: activationRow.invoice_number,
          contractGenerated: activationRow.contract_generated,
          contractUrl: activationRow.contract_url,
          sentBackAt: activationRow.sent_back_at,
          sentBackNote: activationRow.sent_back_note,
          activatedAt: activationRow.activated_at,
        }
      : null;
    const planHistoryRows = await tx`
      SELECT
        mph.id,
        mph.plan_tier AS "planTier",
        mph.assigned_at AS "assignedAt",
        mph.expiry_at AS "expiryAt",
        mph.notes,
        mph.assigned_by AS "assignedBy",
        s.name AS "assignedByName"
      FROM mua_plan_history mph
      LEFT JOIN staff s ON s.id = mph.assigned_by
      WHERE mph.mua_id = ${pipeline.muaId}::uuid
      ORDER BY mph.assigned_at DESC
      LIMIT 20
    `;
    const planHistory = planHistoryRows.map((r: any) => ({
      ...r,
      planTier: fromDbPlanTier(r.planTier),
    }));

    const callyzerCalls = await tx`
      SELECT id, direction, duration_sec AS "durationSec", called_at AS "calledAt", outcome, recording_url AS "recordingUrl"
      FROM sales.call_logs
      WHERE pipeline_id = ${id}::uuid
      ORDER BY called_at DESC
      LIMIT 50
    `;
    const manualCalls = await tx`
      SELECT id, description, metadata, created_at AS "calledAt"
      FROM sales.comms_log
      WHERE pipeline_id = ${id}::uuid AND entry_type = 'callLogged'
      ORDER BY created_at DESC
      LIMIT 50
    `;
    const calls = [
      ...callyzerCalls.map((c: any) => ({ ...c, source: "callyzer" as const })),
      ...manualCalls.map((c: any) => ({
        id: c.id,
        source: "manual" as const,
        direction: c.metadata?.direction ?? "outbound",
        durationSec: typeof c.metadata?.durationSec === "number" ? c.metadata.durationSec : (Number(c.metadata?.durationMins) || 0) * 60,
        calledAt: c.metadata?.occurredAt ?? c.calledAt,
        outcome: c.metadata?.outcome ?? null,
        recordingUrl: null,
        description: c.description,
      })),
    ].sort((a, b) => new Date(b.calledAt ?? 0).getTime() - new Date(a.calledAt ?? 0).getTime());

    const callSummary = {
      totalCalls: calls.length,
      callyzerCalls: callyzerCalls.length,
      totalDurationSec: calls.reduce((sum, c) => sum + (Number(c.durationSec) || 0), 0),
      lastCallAt: calls[0]?.calledAt ?? null,
      lastCallyzerSyncAt: callyzerCalls[0]?.calledAt ?? null,
    };

    return {
      pipeline: { ...pipeline, daysSinceLastContact },
      muaRegions,
      stageLog,
      tasks,
      payment,
      paymentSummary: { totalPaid, quotedAmount },
      onboarding,
      training,
      activation,
      calls,
      callSummary,
      planHistory,
    };
  });

  if (!data) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;
    const message = error instanceof Error ? error.message : "Failed to load pipeline";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
