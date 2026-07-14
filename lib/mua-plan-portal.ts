import { sql } from "@/db/index";
import { fromDbPlanTier } from "@/lib/db-mappers";
import { normalizeServiceOfferings } from "@/lib/mua-service-catalog";
import { normalizePlansShared, readStoredBoolean } from "@/lib/sales-plan-details";
import type { PlanTier } from "@/lib/types";
import type { MuaServiceOffering } from "@/lib/mua-service-catalog";

export type MuaPortfolioItem = {
  id: string;
  title: string;
  description: string | null;
  mediaUrl: string;
  sortOrder: number;
  createdAt: string;
};

export type MuaPlanPortalPayload = {
  plan: {
    tier: PlanTier | null;
    tierName: string | null;
    expiry: string | null;
    listPriceInr: number | null;
    planSummary: string | null;
    weeklyCap: number;
    monthlyPushTarget: number | null;
    assuredBookings: number | null;
    leadCap: number | null;
    leadBudget: string | null;
    planStates: string[];
    planCities: string[];
    durationStart: string | null;
    durationEnd: string | null;
  };
  commercial: {
    pipelineId: string | null;
    pipelineStage: string | null;
    planName: string | null;
    quotedAmount: number | null;
    plansShared: { plan: string; amount: number }[];
    payments: { amount: number; paymentDate: string; paymentMode: string }[];
    invoiceGenerated: boolean;
    invoiceNumber: string | null;
    contractGenerated: boolean;
    contractUrl: string | null;
    activatedAt: string | null;
    salesClosedByName: string | null;
  };
  /** Captured at Confirm / Deal Closed from sales.onboarding */
  dealTerms: {
    rmSupport: boolean | null;
    leadReversal: boolean | null;
    socialMedia: string | null;
    hasSocialMedia: boolean | null;
    assuredBookings: number | null;
    avgRevenueTarget: number | null;
    email: string | null;
  } | null;
  contactEmail: string | null;
  servicePricing: MuaServiceOffering[];
  portalProfileUrl: string | null;
  portfolioItems: MuaPortfolioItem[];
};

async function resolveSalesPipelineId(muaId: string): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    SELECT p.id
    FROM sales.pipeline p
    LEFT JOIN sales.activation_log al ON al.pipeline_id = p.id
    WHERE p.mua_id = ${muaId}::uuid
    ORDER BY
      al.activated_at DESC NULLS LAST,
      CASE WHEN p.stage IN ('Deal Closed', 'Activated') THEN 0 ELSE 1 END,
      p.updated_at DESC
    LIMIT 1
  `;
  return row?.id ?? null;
}

export async function fetchMuaPlanPortal(muaId: string): Promise<MuaPlanPortalPayload | null> {
  const [mua] = await sql<
    {
      planTier: string | null;
      planExpiry: string | null;
      weeklyCap: number;
      monthlyPushTarget: number | null;
      assuredBookings: number | null;
      leadCap: number | null;
      leadBudget: string | null;
      planStates: string[] | null;
      planCities: string[] | null;
      serviceOfferings: unknown;
      listPriceInr: number | null;
      planSummary: string | null;
      tierName: string | null;
      email: string | null;
    }[]
  >`
    SELECT
      m.plan_tier::text AS "planTier",
      m.plan_expiry::text AS "planExpiry",
      COALESCE(m.weekly_cap_override, pt.weekly_cap, 0)
        + COALESCE(m.weekly_cap_bonus, 0) AS "weeklyCap",
      pt.monthly_push_target AS "monthlyPushTarget",
      pt.assured_bookings AS "assuredBookings",
      m.lead_cap AS "leadCap",
      m.lead_budget AS "leadBudget",
      m.plan_states AS "planStates",
      m.plan_cities AS "planCities",
      m.service_offerings AS "serviceOfferings",
      pt.list_price_inr AS "listPriceInr",
      pt.plan_summary AS "planSummary",
      pt.name AS "tierName",
      COALESCE(
        NULLIF(BTRIM(m.email), ''),
        (
          SELECT NULLIF(BTRIM(o.email), '')
          FROM sales.onboarding o
          JOIN sales.pipeline p ON p.id = o.pipeline_id
          WHERE p.mua_id = m.id
          ORDER BY o.updated_at DESC NULLS LAST
          LIMIT 1
        )
      ) AS email
    FROM muas m
    LEFT JOIN plan_tiers pt ON pt.tier = m.plan_tier
    WHERE m.id = ${muaId}::uuid
  `;
  if (!mua) return null;

  const pipelineId = await resolveSalesPipelineId(muaId);

  let commercial: MuaPlanPortalPayload["commercial"] = {
    pipelineId,
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
  };

  let portalProfileUrl: string | null = null;
  let durationStart: string | null = null;
  let durationEnd: string | null = null;
  let dealTerms: MuaPlanPortalPayload["dealTerms"] = null;

  if (pipelineId) {
    const [pipe] = await sql<{ stage: string; salesClosedByName: string | null }[]>`
      SELECT
        p.stage,
        COALESCE(sc_pipe.name, sc_mua.name) AS "salesClosedByName"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      LEFT JOIN staff sc_pipe ON sc_pipe.id = p.sales_closed_by
      LEFT JOIN staff sc_mua ON sc_mua.id = m.sales_closed_by
      WHERE p.id = ${pipelineId}::uuid
    `;
    commercial.pipelineStage = pipe?.stage ?? null;
    commercial.salesClosedByName = pipe?.salesClosedByName ?? null;

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
        email
      FROM sales.onboarding
      WHERE pipeline_id = ${pipelineId}::uuid
    `;
    if (onboarding) {
      commercial.planName = onboarding.plan;
      commercial.quotedAmount =
        onboarding.quotedAmount != null ? Number(onboarding.quotedAmount) : null;
      commercial.plansShared = normalizePlansShared(onboarding.plansShared);
      durationStart = onboarding.durationStart?.slice(0, 10) ?? null;
      durationEnd = onboarding.durationEnd?.slice(0, 10) ?? null;
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

    const [training] = await sql<{ profileLink: string | null }[]>`
      SELECT profile_link AS "profileLink"
      FROM sales.training
      WHERE pipeline_id = ${pipelineId}::uuid
    `;
    portalProfileUrl = training?.profileLink?.trim() || null;

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
  } else {
    const [muaCloser] = await sql<{ salesClosedByName: string | null }[]>`
      SELECT sc.name AS "salesClosedByName"
      FROM muas m
      LEFT JOIN staff sc ON sc.id = m.sales_closed_by
      WHERE m.id = ${muaId}::uuid
    `;
    commercial.salesClosedByName = muaCloser?.salesClosedByName ?? null;
  }

  const portfolioItems = await sql<MuaPortfolioItem[]>`
    SELECT
      id,
      title,
      description,
      media_url AS "mediaUrl",
      sort_order AS "sortOrder",
      created_at AS "createdAt"
    FROM mua_portfolio_items
    WHERE mua_id = ${muaId}::uuid
    ORDER BY sort_order ASC, created_at DESC
  `;

  return {
    plan: {
      tier: fromDbPlanTier(mua.planTier),
      tierName: mua.tierName,
      expiry: mua.planExpiry?.slice(0, 10) ?? null,
      listPriceInr: mua.listPriceInr != null ? Number(mua.listPriceInr) : null,
      planSummary: mua.planSummary,
      weeklyCap: Number(mua.weeklyCap),
      monthlyPushTarget: mua.monthlyPushTarget,
      assuredBookings: mua.assuredBookings,
      leadCap: mua.leadCap,
      leadBudget: mua.leadBudget,
      planStates: mua.planStates ?? [],
      planCities: mua.planCities ?? [],
      durationStart,
      durationEnd,
    },
    commercial,
    dealTerms,
    contactEmail: mua.email?.trim() || dealTerms?.email || null,
    servicePricing: normalizeServiceOfferings(mua.serviceOfferings),
    portalProfileUrl,
    portfolioItems,
  };
}

export async function fetchMuaPortfolioItems(muaId: string): Promise<MuaPortfolioItem[]> {
  return sql<MuaPortfolioItem[]>`
    SELECT
      id,
      title,
      description,
      media_url AS "mediaUrl",
      sort_order AS "sortOrder",
      created_at AS "createdAt"
    FROM mua_portfolio_items
    WHERE mua_id = ${muaId}::uuid
    ORDER BY sort_order ASC, created_at DESC
  `;
}
