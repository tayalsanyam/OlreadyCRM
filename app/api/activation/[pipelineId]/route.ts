import { NextResponse } from "next/server";
import { generateTaskDisplayId, withTransaction } from "@/db/index";
import { requireActivationAccess } from "@/lib/api-auth";
import { appendSalesEventToRmComms } from "@/lib/sales-ledger";
import { toDbTaskType } from "@/lib/db-mappers";
import { createNotification } from "@/lib/notifications";
import {
  loadPipelineQuotedAmount,
  paymentBalanceLabel,
  sumPipelinePayments,
} from "@/lib/sales-deal-payment";
import { applyOnboardingPlanOnActivation, type OnboardingPlanActivationRow } from "@/lib/sales-activation-plan";
import {
  completePendingContractSignatureFollowUpTasks,
  completePendingSalesActivationTasks,
  contractSignatureFollowUpTitle,
} from "@/lib/sales-activation-tasks";
import { applyActivationSendBack } from "@/lib/sales-activation-send-back";
import { readStoredBoolean } from "@/lib/sales-plan-details";
import { assertValidPlanRm, fetchPlanRmOptionsForRegions } from "@/lib/plan-rm";
import { sanitizeUploadFilename, saveUploadFromFile } from "@/lib/file-storage";

type Body = {
  step?:
    | "profileLinkVerified"
    | "invoiceGenerated"
    | "invoiceNumber"
    | "contractGenerated"
    | "contractUrl"
    | "sendBack"
    | "activate";
  value?: boolean | string;
  note?: string;
  planRmId?: string;
};

type ActivationState = {
  profileLinkVerified: boolean;
  invoiceGenerated: boolean;
  invoiceNumber: string | null;
  contractGenerated: boolean;
  contractUrl: string | null;
  activatedAt?: string | null;
  sentBackAt?: string | null;
};

async function verifyProfileLinkReachable(profileLink: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(profileLink);
  } catch {
    throw new Error("Training profile link is not a valid URL");
  }
  if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) {
    throw new Error("Training profile link must use http/https");
  }
  if (!parsed.hostname.includes("olready.in")) {
    throw new Error("Training profile link must be an olready.in URL");
  }
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(profileLink, { method: "GET", signal: ctrl.signal });
    if (!res.ok) throw new Error("Profile link is not reachable");
  } catch {
    throw new Error("Could not verify profile link reachability");
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ pipelineId: string }> }) {
  const auth = await requireActivationAccess();
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const { pipelineId } = await params;

  try {
  const data = await withTransaction(async (tx) => {
    const [pipeline] = await tx`
      SELECT
        p.id,
        p.mua_id AS "muaId",
        p.mua_type AS "muaType",
        p.stage,
        p.assigned_to AS "assignedTo",
        assignee.name AS "assignedSalesName",
        p.sales_closed_by AS "salesClosedBy",
        closed.name AS "salesClosedByName",
        m.name AS "muaName",
        m.phone AS "muaPhone",
        m.city AS "muaCity",
        m.source AS "muaSource",
        m.status AS "muaStatus",
        m.instagram,
        m.plan_tier AS "planTier",
        m.plan_expiry AS "planExpiry",
        NULL::jsonb AS regions,
        NULL::jsonb AS cities
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      LEFT JOIN staff assignee ON assignee.id = p.assigned_to
      LEFT JOIN staff closed ON closed.id = p.sales_closed_by
      WHERE p.id = ${pipelineId}::uuid
      LIMIT 1
    `;
    if (!pipeline) return null;
    const [training] = await tx`
      SELECT complete, profile_link AS "profileLink", updated_at AS "updatedAt"
      FROM sales.training
      WHERE pipeline_id = ${pipelineId}::uuid
    `;
    const [activation] = await tx`
      SELECT
        profile_link_verified AS "profileLinkVerified",
        invoice_generated AS "invoiceGenerated",
        invoice_number AS "invoiceNumber",
        contract_generated AS "contractGenerated",
        contract_url AS "contractUrl",
        sent_back_at AS "sentBackAt",
        sent_back_note AS "sentBackNote",
        activated_at AS "activatedAt"
      FROM sales.activation_log
      WHERE pipeline_id = ${pipelineId}::uuid
    `;
    const [onboarding] = await tx`
      SELECT
        mua_name AS "muaName",
        business_name AS "businessName",
        official_address AS "officialAddress",
        email,
        gst_number AS "gstNumber",
        alternate_phone AS "alternatePhone",
        business_manager_phone AS "businessManagerPhone",
        plan,
        lead_cap AS "leadCap",
        lead_budget AS "leadBudget",
        states,
        regions,
        cities,
        social_media AS "socialMedia",
        rm_support AS "rmSupport",
        lead_reversal_offered AS "leadReversal",
        quoted_amount AS "quotedAmount",
        duration_start AS "durationStart",
        duration_end AS "durationEnd",
        assured_bookings AS "assuredBookings",
        avg_revenue_target AS "avgRevenueTarget",
        checklist1_complete AS "checklist1Complete",
        checklist2_complete AS "checklist2Complete",
        updated_at AS "updatedAt"
      FROM sales.onboarding
      WHERE pipeline_id = ${pipelineId}::uuid
    `;
    const [payment] = await tx`
      SELECT
        amount,
        payment_date AS "paymentDate",
        payment_mode AS "paymentMode",
        notes
      FROM sales.payment_records
      WHERE pipeline_id = ${pipelineId}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const quotedAmount = await loadPipelineQuotedAmount(tx, pipelineId);
    const totalPaid = await sumPipelinePayments(tx, pipelineId);
    const onboardingOut = onboarding
      ? {
          ...onboarding,
          rmSupport: readStoredBoolean(onboarding.rmSupport),
          leadReversal: readStoredBoolean(onboarding.leadReversal),
          hasSocialMedia:
            onboarding.socialMedia === ""
              ? false
              : onboarding.socialMedia
                ? true
                : null,
          quotedAmount,
        }
      : null;
    const planRmOptions =
      onboardingOut?.rmSupport && (onboarding?.regions?.length ?? 0) > 0
        ? await fetchPlanRmOptionsForRegions(tx, onboarding!.regions ?? [])
        : onboardingOut?.rmSupport
          ? await fetchPlanRmOptionsForRegions(tx, [])
          : [];
    return {
      pipeline,
      training,
      activation,
      onboarding: onboardingOut,
      payment,
      paymentSummary: {
        quotedAmount,
        totalPaid,
        statusLabel: paymentBalanceLabel(quotedAmount, totalPaid),
      },
      planRmOptions,
    };
  });

  if (!data) return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  return NextResponse.json({ data, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load activation";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ pipelineId: string }> }) {
  const auth = await requireActivationAccess();
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const { pipelineId } = await params;

  const form = await request.formData().catch(() => null);
  const file = form?.get("contractFile");
  if (!(file instanceof File)) {
    return NextResponse.json({ data: null, error: "Contract file is required" }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ data: null, error: "Contract file is empty" }, { status: 400 });
  }

  const allowed = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  if (!allowed.has(file.type)) {
    return NextResponse.json({ data: null, error: "Unsupported file type. Use PDF, DOCX, JPG, or PNG." }, { status: 400 });
  }

  try {
    const data = await withTransaction(async (tx) => {
      await tx`INSERT INTO sales.activation_log (pipeline_id) VALUES (${pipelineId}::uuid) ON CONFLICT (pipeline_id) DO NOTHING`;
      const [training] = await tx<{ complete: boolean }[]>`
        SELECT complete FROM sales.training WHERE pipeline_id = ${pipelineId}::uuid
      `;
      const [activation] = await tx<ActivationState[]>`
        SELECT
          profile_link_verified AS "profileLinkVerified",
          invoice_generated AS "invoiceGenerated",
          invoice_number AS "invoiceNumber",
          contract_generated AS "contractGenerated",
          contract_url AS "contractUrl"
        FROM sales.activation_log
        WHERE pipeline_id = ${pipelineId}::uuid
      `;
      const state: ActivationState = activation ?? {
        profileLinkVerified: false,
        invoiceGenerated: false,
        invoiceNumber: null,
        contractGenerated: false,
        contractUrl: null,
      };
      if (!training?.complete) throw new Error("Training must be complete before contract upload");
      if (!state.profileLinkVerified || !state.invoiceGenerated || !state.invoiceNumber?.trim() || !state.contractGenerated) {
        throw new Error("Complete verification, invoice, and contract generation before contract upload");
      }

      const savedName = `${pipelineId}-${Date.now()}-${sanitizeUploadFilename(file.name)}`;
      const { publicPath: contractPath } = await saveUploadFromFile("contracts", savedName, file);

      await tx`
        UPDATE sales.activation_log
        SET contract_url = ${contractPath}, contract_uploaded_at = NOW()
        WHERE pipeline_id = ${pipelineId}::uuid
      `;
      await tx`
        INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id)
        VALUES (${pipelineId}::uuid, 'activationUpdated', 'Activation step: contractFileUploaded', ${auth.session.userId}::uuid)
      `;
      const [pipelineRow] = await tx<{ muaId: string }[]>`
        SELECT mua_id AS "muaId" FROM sales.pipeline WHERE id = ${pipelineId}::uuid
      `;
      await appendSalesEventToRmComms(tx, {
        muaId: pipelineRow?.muaId ?? null,
        actorId: auth.session.userId,
        description: "[Sales] Activation step: contractFileUploaded",
        metadata: { pipelineId, filename: file.name, size: file.size },
      });
      const [row] = await tx`SELECT * FROM sales.activation_log WHERE pipeline_id = ${pipelineId}::uuid`;
      return row;
    });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Contract upload failed";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ pipelineId: string }> }) {
  const auth = await requireActivationAccess();
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const { pipelineId } = await params;
  const body = (await request.json().catch(() => ({}))) as Body;

  try {
    const data = await withTransaction(async (tx) => {
      await tx`INSERT INTO sales.activation_log (pipeline_id) VALUES (${pipelineId}::uuid) ON CONFLICT (pipeline_id) DO NOTHING`;
      const [pipeline] = await tx<{ id: string; muaId: string; assignedTo: string | null; muaName: string; salesClosedBy: string | null; closedByName: string | null }[]>`
        SELECT p.id, p.mua_id AS "muaId", p.assigned_to AS "assignedTo", p.sales_closed_by AS "salesClosedBy", m.name AS "muaName", sc.name AS "closedByName"
        FROM sales.pipeline p
        JOIN muas m ON m.id = p.mua_id
        LEFT JOIN staff sc ON sc.id = p.sales_closed_by
        WHERE p.id = ${pipelineId}::uuid
        LIMIT 1
      `;
      if (!pipeline) throw new Error("Pipeline not found");
      const [training] = await tx<{ complete: boolean; profileLink: string | null }[]>`
        SELECT complete, profile_link AS "profileLink" FROM sales.training WHERE pipeline_id = ${pipelineId}::uuid
      `;
      const [activation] = await tx<ActivationState[]>`
        SELECT
          profile_link_verified AS "profileLinkVerified",
          invoice_generated AS "invoiceGenerated",
          invoice_number AS "invoiceNumber",
          contract_generated AS "contractGenerated",
          contract_url AS "contractUrl",
          activated_at AS "activatedAt",
          sent_back_at AS "sentBackAt",
          sent_back_note AS "sentBackNote"
        FROM sales.activation_log
        WHERE pipeline_id = ${pipelineId}::uuid
      `;
      const state: ActivationState = activation ?? {
        profileLinkVerified: false,
        invoiceGenerated: false,
        invoiceNumber: null,
        contractGenerated: false,
        contractUrl: null,
      };
      const trainingComplete = Boolean(training?.complete);
      const hasInvoiceNumber = Boolean(state.invoiceNumber?.trim());
      const hasContractUrl = Boolean(state.contractUrl?.trim());

      const ensure = (condition: boolean, message: string) => {
        if (!condition) throw new Error(message);
      };

      if (body.step === "profileLinkVerified") {
        ensure(trainingComplete, "Training must be complete before profile verification");
        if (Boolean(body.value)) {
          ensure(Boolean(training?.profileLink?.trim()), "Training profile link is missing");
          await verifyProfileLinkReachable(training!.profileLink!.trim());
        }
        await tx`UPDATE sales.activation_log SET profile_link_verified = ${Boolean(body.value)} WHERE pipeline_id = ${pipelineId}::uuid`;
      } else if (body.step === "invoiceGenerated") {
        ensure(trainingComplete, "Training must be complete before invoice generation");
        ensure(state.profileLinkVerified, "Verify profile link before invoice generation");
        await tx`UPDATE sales.activation_log SET invoice_generated = ${Boolean(body.value)}, invoice_generated_at = CASE WHEN ${Boolean(body.value)} THEN NOW() ELSE NULL END WHERE pipeline_id = ${pipelineId}::uuid`;
      } else if (body.step === "invoiceNumber") {
        ensure(trainingComplete, "Training must be complete before invoice number");
        ensure(state.profileLinkVerified, "Verify profile link before invoice number");
        ensure(state.invoiceGenerated, "Generate invoice before entering invoice number");
        ensure(Boolean(String(body.value ?? "").trim()), "Invoice number is required");
        await tx`UPDATE sales.activation_log SET invoice_number = ${String(body.value ?? "").trim() || null} WHERE pipeline_id = ${pipelineId}::uuid`;
      } else if (body.step === "contractGenerated") {
        ensure(trainingComplete, "Training must be complete before contract generation");
        ensure(state.profileLinkVerified && state.invoiceGenerated && hasInvoiceNumber, "Complete invoice steps before contract generation");
        await tx`UPDATE sales.activation_log SET contract_generated = ${Boolean(body.value)}, contract_generated_at = CASE WHEN ${Boolean(body.value)} THEN NOW() ELSE NULL END WHERE pipeline_id = ${pipelineId}::uuid`;
        if (Boolean(body.value)) {
          if (pipeline.assignedTo) {
            const taskDisplayId = await generateTaskDisplayId(tx);
            await tx`
              INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
              VALUES (
                ${taskDisplayId},
                ${pipeline.assignedTo}::uuid,
                NULL,
                NULL,
                ${toDbTaskType("salesFollowUp")}::task_type,
                ${contractSignatureFollowUpTitle(pipeline.muaName, pipelineId)},
                CURRENT_DATE + INTERVAL '1 day',
                'pending'
              )
            `;
          }
        }
      } else if (body.step === "contractUrl") {
        throw new Error("Use contract file upload instead of URL");
      } else if (body.step === "sendBack") {
        ensure(Boolean(body.note?.trim()), "Send back note is required");
        await applyActivationSendBack(tx, {
          pipelineId,
          muaName: pipeline.muaName,
          assignedTo: pipeline.assignedTo,
          salesClosedBy: pipeline.salesClosedBy,
          note: body.note!.trim(),
          actorId: auth.session.userId,
        });
      } else if (body.step === "activate") {
        if (activation?.activatedAt) {
          throw new Error("This MUA is already activated");
        }
        ensure(trainingComplete, "Training must be complete before activation");
        ensure(state.profileLinkVerified, "Verify profile link before activation");
        ensure(state.invoiceGenerated, "Generate invoice before activation");
        ensure(hasInvoiceNumber, "Invoice number is required before activation");
        ensure(state.contractGenerated, "Generate contract before activation");
        ensure(hasContractUrl, "Contract upload is required before activation");
        const [onb] = await tx<
          (OnboardingPlanActivationRow & { rmSupport: boolean | string | null; regions: string[] | null })[]
        >`
          SELECT
            plan,
            lead_cap AS "leadCap",
            lead_budget AS "leadBudget",
            states,
            regions,
            cities,
            social_media AS "socialMedia",
            duration_end AS "durationEnd",
            rm_support AS "rmSupport"
          FROM sales.onboarding
          WHERE pipeline_id = ${pipelineId}::uuid
        `;
        if (!onb) throw new Error("Missing onboarding data");

        const rmSupport = readStoredBoolean(onb.rmSupport);
        let planRm: { id: string; name: string } | null = null;
        if (rmSupport) {
          const planRmId = body.planRmId?.trim();
          if (!planRmId) throw new Error("Select a Plan RM before activation");
          planRm = await assertValidPlanRm(tx, planRmId, onb.regions ?? []);
        }

        await applyOnboardingPlanOnActivation(
          tx,
          pipeline.muaId,
          auth.session.userId,
          pipelineId,
          onb,
          planRm?.id ?? null,
        );

        await tx`
          UPDATE muas
          SET
            sales_closed_by = COALESCE(sales_closed_by, ${pipeline.salesClosedBy}::uuid),
            team_id = COALESCE(team_id, (SELECT team_id FROM sales.pipeline p WHERE p.id = ${pipelineId}::uuid))
          WHERE id = ${pipeline.muaId}::uuid
        `;

        await tx`
          UPDATE sales.activation_log
          SET activated_at = NOW(), activated_by = ${auth.session.userId}::uuid
          WHERE pipeline_id = ${pipelineId}::uuid
        `;

        await completePendingSalesActivationTasks(tx, pipelineId);
        await completePendingContractSignatureFollowUpTasks(tx, pipelineId);

        if (planRm) {
          await createNotification(tx, {
            userId: planRm.id,
            message: `You are the Plan RM for ${pipeline.muaName}. Review their profile and plan support.`,
            link: `/rm/muas/${pipeline.muaId}`,
          });
          const admins = await tx<{ id: string }[]>`SELECT id FROM staff WHERE role = 'admin' AND active = true`;
          for (const admin of admins) {
            await createNotification(tx, {
              userId: admin.id,
              message: `Plan activated for ${pipeline.muaName}. Plan RM: ${planRm.name}.`,
              link: "/admin/muas",
            });
          }
        } else {
          const admins = await tx<{ id: string }[]>`SELECT id FROM staff WHERE role = 'admin' AND active = true`;
          for (const admin of admins) {
            await createNotification(tx, {
              userId: admin.id,
              message: `Plan activated for ${pipeline.muaName}. Closed by: ${pipeline.closedByName ?? "Unknown"}.`,
              link: "/admin/muas",
            });
          }
        }
      } else {
        throw new Error("Invalid activation step");
      }

      await tx`
        INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id)
        VALUES (
          ${pipelineId}::uuid,
          'activationUpdated',
          ${`Activation step: ${body.step ?? "unknown"}`},
          ${auth.session.userId}::uuid
        )
      `;
      const [pipelineRow] = await tx<{ muaId: string }[]>`
        SELECT mua_id AS "muaId" FROM sales.pipeline WHERE id = ${pipelineId}::uuid
      `;
      await appendSalesEventToRmComms(tx, {
        muaId: pipelineRow?.muaId ?? null,
        actorId: auth.session.userId,
        description: `[Sales] Activation step: ${body.step ?? "unknown"}`,
        metadata: { pipelineId, step: body.step ?? null },
      });

      const [row] = await tx`SELECT * FROM sales.activation_log WHERE pipeline_id = ${pipelineId}::uuid`;
      return row;
    });

    return NextResponse.json({ data, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Activation update failed";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
