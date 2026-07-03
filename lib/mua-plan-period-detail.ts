import { sql } from "@/db/index";
import { fromDbPlanTier, toDbPlanTier } from "@/lib/db-mappers";
import { parsePlanTier } from "@/lib/mua-import";
import type { MuaPlanPortalPayload } from "@/lib/mua-plan-portal";
import { fetchMuaPlanPortal } from "@/lib/mua-plan-portal";
import {
  portalPayloadToPeriodDetail,
  type MuaPlanPeriodDetail,
} from "@/lib/mua-plan-period-detail-shared";
import { normalizePlansShared, readStoredBoolean } from "@/lib/sales-plan-details";
import type { PlanTier } from "@/lib/types";

export type { MuaPlanPeriodDetail } from "@/lib/mua-plan-period-detail-shared";
export { portalPayloadToPeriodDetail } from "@/lib/mua-plan-period-detail-shared";

function planDateKey(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function parsePipelineIdFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/pipeline\s+([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

async function loadPipelineCommercial(pipelineId: string) {
  const [pipe] = await sql<{ stage: string; muaId: string; salesClosedByName: string | null }[]>`
    SELECT
      p.stage,
      p.mua_id AS "muaId",
      COALESCE(sc_pipe.name, sc_mua.name) AS "salesClosedByName"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    LEFT JOIN staff sc_pipe ON sc_pipe.id = p.sales_closed_by
    LEFT JOIN staff sc_mua ON sc_mua.id = m.sales_closed_by
    WHERE p.id = ${pipelineId}::uuid
  `;
  if (!pipe) return null;

  let commercial: MuaPlanPortalPayload["commercial"] = {
    pipelineId,
    pipelineStage: pipe.stage,
    planName: null,
    quotedAmount: null,
    plansShared: [],
    payments: [],
    invoiceGenerated: false,
    invoiceNumber: null,
    contractGenerated: false,
    contractUrl: null,
    activatedAt: null,
    salesClosedByName: pipe.salesClosedByName,
  };

  let durationStart: string | null = null;
  let durationEnd: string | null = null;
  let dealTerms: MuaPlanPortalPayload["dealTerms"] = null;
  let leadCap: number | null = null;
  let leadBudget: string | null = null;
  let planStates: string[] = [];
  let planCities: string[] = [];

  const [onboarding] = await sql<
    {
      plan: string | null;
      quotedAmount: string | null;
      plansShared: unknown;
      durationStart: string | null;
      durationEnd: string | null;
      rmSupport: boolean | null;
      leadReversal: boolean | null;
      socialMedia: string | null;
      assuredBookings: number | null;
      avgRevenueTarget: string | null;
      email: string | null;
      leadCap: number | null;
      leadBudget: string | null;
      states: string[] | null;
      cities: string[] | null;
    }[]
  >`
    SELECT
      plan,
      quoted_amount AS "quotedAmount",
      plans_shared AS "plansShared",
      duration_start::text AS "durationStart",
      duration_end::text AS "durationEnd",
      rm_support AS "rmSupport",
      lead_reversal_offered AS "leadReversal",
      social_media AS "socialMedia",
      assured_bookings AS "assuredBookings",
      avg_revenue_target AS "avgRevenueTarget",
      email,
      lead_cap AS "leadCap",
      lead_budget AS "leadBudget",
      states,
      cities
    FROM sales.onboarding
    WHERE pipeline_id = ${pipelineId}::uuid
  `;

  if (onboarding) {
    commercial.planName = onboarding.plan;
    commercial.quotedAmount =
      onboarding.quotedAmount != null ? Number(onboarding.quotedAmount) : null;
    commercial.plansShared = normalizePlansShared(onboarding.plansShared);
    durationStart = planDateKey(onboarding.durationStart);
    durationEnd = planDateKey(onboarding.durationEnd);
    leadCap = onboarding.leadCap;
    leadBudget = onboarding.leadBudget;
    planStates = onboarding.states ?? [];
    planCities = onboarding.cities ?? [];
    const socialMedia = onboarding.socialMedia?.trim() ?? "";
    dealTerms = {
      rmSupport: readStoredBoolean(onboarding.rmSupport),
      leadReversal: readStoredBoolean(onboarding.leadReversal),
      socialMedia: socialMedia || null,
      hasSocialMedia: socialMedia === "" ? false : socialMedia ? true : null,
      assuredBookings: onboarding.assuredBookings,
      avgRevenueTarget:
        onboarding.avgRevenueTarget != null ? Number(onboarding.avgRevenueTarget) : null,
      email: onboarding.email?.trim() || null,
    };
  }

  const [activation] = await sql<
    {
      invoiceGenerated: boolean;
      invoiceNumber: string | null;
      contractGenerated: boolean;
      contractUrl: string | null;
      activatedAt: string | null;
    }[]
  >`
    SELECT
      invoice_generated AS "invoiceGenerated",
      invoice_number AS "invoiceNumber",
      contract_generated AS "contractGenerated",
      contract_url AS "contractUrl",
      activated_at AS "activatedAt"
    FROM sales.activation_log
    WHERE pipeline_id = ${pipelineId}::uuid
  `;
  if (activation) {
    commercial = {
      ...commercial,
      invoiceGenerated: activation.invoiceGenerated,
      invoiceNumber: activation.invoiceNumber,
      contractGenerated: activation.contractGenerated,
      contractUrl: activation.contractUrl,
      activatedAt: activation.activatedAt,
    };
  }

  commercial.payments = await sql<
    { amount: number; paymentDate: string; paymentMode: string }[]
  >`
    SELECT
      amount::float AS amount,
      payment_date::text AS "paymentDate",
      payment_mode AS "paymentMode"
    FROM sales.payment_records
    WHERE pipeline_id = ${pipelineId}::uuid
    ORDER BY payment_date DESC
  `;

  return {
    commercial,
    dealTerms,
    durationStart,
    durationEnd,
    leadCap,
    leadBudget,
    planStates,
    planCities,
    onboardingPlanLabel: onboarding?.plan ?? null,
  };
}

async function loadTierCatalogPlan(
  planTier: PlanTier | null,
  expiryAt: string | null,
  assignedAt: string,
  leadCap?: number | null,
  leadBudget?: string | null,
  planStates?: string[],
  planCities?: string[],
  durationStart?: string | null,
  durationEnd?: string | null
): Promise<MuaPlanPeriodDetail["plan"]> {
  const dbTier = planTier ? toDbPlanTier(planTier) : null;
  const [tierRow] = dbTier
    ? await sql<
        {
          listPriceInr: number | null;
          planSummary: string | null;
          weeklyCap: number;
          monthlyPushTarget: number | null;
          assuredBookings: number | null;
          tierName: string | null;
        }[]
      >`
        SELECT
          list_price_inr AS "listPriceInr",
          plan_summary AS "planSummary",
          weekly_cap AS "weeklyCap",
          monthly_push_target AS "monthlyPushTarget",
          assured_bookings AS "assuredBookings",
          name AS "tierName"
        FROM plan_tiers
        WHERE tier = ${dbTier}::plan_tier
      `
    : [null];

  return {
    tier: planTier,
    tierName: tierRow?.tierName ?? null,
    expiry: expiryAt,
    listPriceInr: tierRow?.listPriceInr != null ? Number(tierRow.listPriceInr) : null,
    planSummary: tierRow?.planSummary ?? null,
    weeklyCap: tierRow?.weeklyCap ?? 0,
    monthlyPushTarget: tierRow?.monthlyPushTarget ?? null,
    assuredBookings: tierRow?.assuredBookings ?? null,
    leadCap: leadCap ?? null,
    leadBudget: leadBudget ?? null,
    planStates: planStates ?? [],
    planCities: planCities ?? [],
    durationStart: durationStart ?? planDateKey(assignedAt),
    durationEnd: durationEnd ?? expiryAt,
  };
}

async function resolvePipelineForHistory(
  muaId: string,
  historyId: string,
  notes: string | null,
  assignedAt: string,
  expiryAt: string | null,
  planTier: PlanTier | null
): Promise<string | null> {
  const fromNotes = parsePipelineIdFromNotes(notes);
  if (fromNotes) return fromNotes;

  const [renewal] = await sql<{ pipelineId: string | null }[]>`
    SELECT pipeline_id AS "pipelineId"
    FROM sales.renewal_attempt
    WHERE plan_history_id = ${historyId}::uuid
      AND pipeline_id IS NOT NULL
    ORDER BY triggered_at DESC
    LIMIT 1
  `;
  if (renewal?.pipelineId) return renewal.pipelineId;

  if (!expiryAt) return null;

  const candidates = await sql<
    { id: string; plan: string | null; activatedAt: string | null; updatedAt: string }[]
  >`
    SELECT
      p.id,
      o.plan,
      al.activated_at AS "activatedAt",
      p.updated_at AS "updatedAt"
    FROM sales.pipeline p
    JOIN sales.onboarding o ON o.pipeline_id = p.id
    LEFT JOIN sales.activation_log al ON al.pipeline_id = p.id
    WHERE p.mua_id = ${muaId}::uuid
      AND o.duration_end::date IS NOT DISTINCT FROM ${expiryAt}::date
    ORDER BY al.activated_at DESC NULLS LAST, p.updated_at DESC
  `;

  if (planTier && candidates.length > 0) {
    const tierMatch = candidates.find((c) => parsePlanTier(c.plan ?? "") === planTier);
    if (tierMatch) return tierMatch.id;
  }

  if (candidates.length === 1) return candidates[0]!.id;

  if (candidates.length > 1) {
    const assignedMs = new Date(assignedAt).getTime();
    let best = candidates[0]!;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      const ref = c.activatedAt ?? c.updatedAt;
      const delta = Math.abs(new Date(ref).getTime() - assignedMs);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = c;
      }
    }
    return best.id;
  }

  return null;
}

export async function fetchMuaPlanPeriodDetail(
  muaId: string,
  historyId: string
): Promise<MuaPlanPeriodDetail | null> {
  if (historyId === `live:${muaId}`) {
    const portal = await fetchMuaPlanPortal(muaId);
    return portal ? portalPayloadToPeriodDetail(portal) : null;
  }

  const [history] = await sql<
    {
      id: string;
      planTier: string | null;
      assignedAt: string;
      expiryAt: string | null;
      notes: string | null;
    }[]
  >`
    SELECT
      id,
      plan_tier::text AS "planTier",
      assigned_at AS "assignedAt",
      expiry_at AS "expiryAt",
      notes
    FROM mua_plan_history
    WHERE id = ${historyId}::uuid
      AND mua_id = ${muaId}::uuid
  `;
  if (!history) return null;

  const planTier = fromDbPlanTier(history.planTier);
  const expiryAt = planDateKey(history.expiryAt);
  const assignedAt = history.assignedAt;

  const pipelineId = await resolvePipelineForHistory(
    muaId,
    historyId,
    history.notes,
    assignedAt,
    expiryAt,
    planTier
  );

  if (pipelineId) {
    const bundle = await loadPipelineCommercial(pipelineId);
    if (bundle) {
      const onboardingTier = parsePlanTier(bundle.onboardingPlanLabel ?? "");
      const plan = await loadTierCatalogPlan(
        onboardingTier ?? planTier,
        expiryAt,
        assignedAt,
        bundle.leadCap,
        bundle.leadBudget,
        bundle.planStates,
        bundle.planCities,
        bundle.durationStart,
        bundle.durationEnd
      );
      return {
        plan,
        commercial: bundle.commercial,
        dealTerms: bundle.dealTerms,
        contactEmail: bundle.dealTerms?.email ?? null,
        dataSource: "pipeline",
        partialNote: null,
      };
    }
  }

  return {
    plan: await loadTierCatalogPlan(planTier, expiryAt, assignedAt),
    commercial: {
      pipelineId: null,
      pipelineStage: null,
      planName: null,
      quotedAmount: null,
      plansShared: [],
      payments: [],
      invoiceGenerated: false,
      invoiceNumber: null,
      contractGenerated: false,
      contractUrl: null,
      activatedAt: null,
      salesClosedByName: null,
    },
    dealTerms: null,
    contactEmail: null,
    dataSource: "tier_catalog",
    partialNote:
      "Only plan tier catalog details are on file for this period. Deal, invoice, and payment data were not linked to a sales pipeline.",
  };
}
