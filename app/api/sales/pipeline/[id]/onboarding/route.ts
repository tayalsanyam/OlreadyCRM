import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireSalesAccess } from "@/lib/api-auth";
import { appendSalesEventToRmComms } from "@/lib/sales-ledger";
import { upsertOnboardingPlanDetails } from "@/lib/sales-onboarding-upsert";
import type { SalesPlanDetailsInput } from "@/lib/sales-plan-details";

type Body = {
  muaName?: string;
  businessName?: string;
  officialAddress?: string;
  gstNumber?: string;
  email?: string;
  alternatePhone?: string;
  businessManagerPhone?: string;
} & SalesPlanDetailsInput;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAccess();
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Body;

  try {
    if (body.email !== undefined && body.email !== null && body.email.trim() && !isValidEmail(body.email.trim())) {
      throw new Error("Invalid email format");
    }
    if (body.leadCap !== undefined && body.leadCap !== null && body.leadCap <= 0) {
      throw new Error("Lead cap must be greater than 0");
    }
    if (body.assuredBookings !== undefined && body.assuredBookings !== null && body.assuredBookings < 0) {
      throw new Error("Assured bookings cannot be negative");
    }
    if (body.avgRevenueTarget !== undefined && body.avgRevenueTarget !== null && body.avgRevenueTarget < 0) {
      throw new Error("Average revenue target cannot be negative");
    }
    if (body.durationStart && body.durationEnd && new Date(body.durationStart) > new Date(body.durationEnd)) {
      throw new Error("Duration start must be on or before duration end");
    }

    const data = await withTransaction(async (tx) => {
      const planFields: SalesPlanDetailsInput = {
        plan: body.plan,
        leadCap: body.leadCap,
        leadBudget: body.leadBudget,
        states: body.states,
        regions: body.regions,
        cities: body.cities,
        socialMedia: body.socialMedia,
        hasSocialMedia: body.hasSocialMedia,
        rmSupport: body.rmSupport,
        leadReversal: body.leadReversal,
        durationStart: body.durationStart,
        durationEnd: body.durationEnd,
        assuredBookings: body.assuredBookings,
        avgRevenueTarget: body.avgRevenueTarget,
      };

      const hasPlanFields = Object.entries(planFields).some(([, v]) => {
        if (v === undefined || v === null) return false;
        if (typeof v === "boolean") return true;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === "number") return true;
        return String(v).trim() !== "";
      });

      if (hasPlanFields) {
        await upsertOnboardingPlanDetails(tx, id, planFields);
      }

      await tx`
      INSERT INTO sales.onboarding (
        pipeline_id, mua_name, business_name, official_address, gst_number,
        email, alternate_phone, business_manager_phone, updated_at
      ) VALUES (
        ${id}::uuid,
        ${body.muaName ?? null}, ${body.businessName ?? null}, ${body.officialAddress ?? null}, ${body.gstNumber ?? null},
        ${body.email ?? null}, ${body.alternatePhone ?? null}, ${body.businessManagerPhone ?? null}, NOW()
      )
      ON CONFLICT (pipeline_id)
      DO UPDATE SET
        mua_name = COALESCE(EXCLUDED.mua_name, sales.onboarding.mua_name),
        business_name = COALESCE(EXCLUDED.business_name, sales.onboarding.business_name),
        official_address = COALESCE(EXCLUDED.official_address, sales.onboarding.official_address),
        gst_number = COALESCE(EXCLUDED.gst_number, sales.onboarding.gst_number),
        email = COALESCE(EXCLUDED.email, sales.onboarding.email),
        alternate_phone = COALESCE(EXCLUDED.alternate_phone, sales.onboarding.alternate_phone),
        business_manager_phone = COALESCE(EXCLUDED.business_manager_phone, sales.onboarding.business_manager_phone),
        updated_at = NOW()
    `;

      await tx`
      UPDATE sales.onboarding
      SET checklist1_complete = (
            mua_name IS NOT NULL AND business_name IS NOT NULL AND official_address IS NOT NULL AND email IS NOT NULL
          )
      WHERE pipeline_id = ${id}::uuid
    `;

      const changedFields = Object.entries(body)
        .filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
        .map(([k]) => k);
      await tx`
        INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
        VALUES (
          ${id}::uuid,
          'onboardingUpdated',
          'Onboarding checklist updated',
          ${auth.session.userId}::uuid,
          ${tx.json({ changedFields })}
        )
      `;
      const [pipeline] = await tx<{ muaId: string }[]>`
      SELECT mua_id AS "muaId" FROM sales.pipeline WHERE id = ${id}::uuid
      `;
      await appendSalesEventToRmComms(tx, {
        muaId: pipeline?.muaId ?? null,
        actorId: auth.session.userId,
        description: "[Sales] Onboarding checklist updated",
        metadata: { pipelineId: id, changedFields },
      });

      const [row] = await tx`SELECT * FROM sales.onboarding WHERE pipeline_id = ${id}::uuid`;
      return row;
    });

    return NextResponse.json({ data, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Onboarding update failed";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
