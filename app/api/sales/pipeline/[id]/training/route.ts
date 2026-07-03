import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireSalesAccess } from "@/lib/api-auth";
import { appendSalesEventToRmComms } from "@/lib/sales-ledger";
import { ensureActivationTasksForPipeline } from "@/lib/sales-activation-tasks";
import { clearActivationSendBackFlag, completeSalesActivationSendBackTasks, cancelActivationSendBackFollowUpTasks } from "@/lib/sales-activation-send-back";
import { advancePipelineToDealClosedAfterOnboarding } from "@/lib/sales-onboarding-task";

type Body = {
  profileLink?: string;
  stepLeadUnlock?: boolean;
  stepLeadBudget?: boolean;
  stepLeadReversal?: boolean;
  stepRoleOfRm?: boolean;
  stepRmContact?: boolean;
  stepLeadViews?: boolean;
};

function validateProfileLink(link: string): void {
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    throw new Error("Training profile link is not a valid URL");
  }
  if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) {
    throw new Error("Training profile link must use http/https");
  }
  if (!parsed.hostname.includes("olready.in")) {
    throw new Error("Training profile link must be an olready.in URL");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAccess();
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Body;
  if (body.profileLink !== undefined && body.profileLink !== null && body.profileLink.trim()) {
    validateProfileLink(body.profileLink.trim());
  }

  const data = await withTransaction(async (tx) => {
    const stepLeadUnlock = body.stepLeadUnlock ?? null;
    const stepLeadBudget = body.stepLeadBudget ?? null;
    const stepLeadReversal = body.stepLeadReversal ?? null;
    const stepRoleOfRm = body.stepRoleOfRm ?? null;
    const stepRmContact = body.stepRmContact ?? null;
    const stepLeadViews = body.stepLeadViews ?? null;
    await tx`
      INSERT INTO sales.training (
        pipeline_id, profile_link, step_lead_unlock, step_lead_budget,
        step_lead_reversal, step_role_of_rm, step_rm_contact, step_lead_views, updated_at
      ) VALUES (
        ${id}::uuid,
        ${body.profileLink ?? null},
        ${stepLeadUnlock},
        ${stepLeadBudget},
        ${stepLeadReversal},
        ${stepRoleOfRm},
        ${stepRmContact},
        ${stepLeadViews},
        NOW()
      )
      ON CONFLICT (pipeline_id)
      DO UPDATE SET
        profile_link = COALESCE(EXCLUDED.profile_link, sales.training.profile_link),
        step_lead_unlock = COALESCE(EXCLUDED.step_lead_unlock, sales.training.step_lead_unlock),
        step_lead_budget = COALESCE(EXCLUDED.step_lead_budget, sales.training.step_lead_budget),
        step_lead_reversal = COALESCE(EXCLUDED.step_lead_reversal, sales.training.step_lead_reversal),
        step_role_of_rm = COALESCE(EXCLUDED.step_role_of_rm, sales.training.step_role_of_rm),
        step_rm_contact = COALESCE(EXCLUDED.step_rm_contact, sales.training.step_rm_contact),
        step_lead_views = COALESCE(EXCLUDED.step_lead_views, sales.training.step_lead_views),
        updated_at = NOW()
    `;

    const [row] = await tx`
      UPDATE sales.training
      SET complete = (
        profile_link IS NOT NULL
        AND BTRIM(profile_link) <> ''
        AND step_lead_unlock AND step_lead_budget AND step_lead_reversal
        AND step_role_of_rm AND step_rm_contact AND step_lead_views
      )
      WHERE pipeline_id = ${id}::uuid
      RETURNING *
    `;

    const changedFields = Object.entries(body)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k]) => k);
    await tx`
      INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
      VALUES (
        ${id}::uuid,
        'trainingUpdated',
        'Training checklist updated',
        ${auth.session.userId}::uuid,
        ${tx.json({
          changedFields,
          complete: Boolean(row?.complete),
        })}
      )
    `;
    const [pipelineRow] = await tx<{ muaId: string; stage: string }[]>`
      SELECT mua_id AS "muaId", stage::text AS stage FROM sales.pipeline WHERE id = ${id}::uuid LIMIT 1
    `;
    await appendSalesEventToRmComms(tx, {
      muaId: pipelineRow?.muaId ?? null,
      actorId: auth.session.userId,
      description: row?.complete
        ? "[Sales] Training complete — activation task created"
        : "[Sales] Training checklist updated",
      metadata: { pipelineId: id, complete: Boolean(row?.complete), changedFields },
    });

    let stageAdvanced = false;
    let sendBackCleared = false;
    if (row?.complete) {
      sendBackCleared = await clearActivationSendBackFlag(tx, id);
      if (sendBackCleared) {
        await completeSalesActivationSendBackTasks(tx, id);
        await cancelActivationSendBackFollowUpTasks(tx, id);
        await tx`
          INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id)
          VALUES (
            ${id}::uuid,
            'trainingUpdated',
            'Training re-complete after activation send-back — returned to activation queue',
            ${auth.session.userId}::uuid
          )
        `;
      }
      stageAdvanced = await advancePipelineToDealClosedAfterOnboarding(tx, id, auth.session.userId);
      await ensureActivationTasksForPipeline(tx, {
        pipelineId: id,
        title: sendBackCleared
          ? `Activation resume — training fixed [PIPE:${id}]`
          : `Activation required — training complete [PIPE:${id}]`,
        dueDate: new Date().toISOString().slice(0, 10),
      });
    }

    const [stageRow] = await tx<{ stage: string }[]>`
      SELECT stage::text AS stage FROM sales.pipeline WHERE id = ${id}::uuid LIMIT 1
    `;

    return { row, stageAdvanced, pipelineStage: stageRow?.stage ?? pipelineRow?.stage ?? null };
  });

  return NextResponse.json({
    data: {
      ...data.row,
      stageAdvanced: data.stageAdvanced,
      pipelineStage: data.pipelineStage,
    },
    error: null,
  });
}
