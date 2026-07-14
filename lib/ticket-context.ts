import type { TransactionSql } from "@/db/index";
import { mapOnboardingRow } from "@/lib/sales-plan-details";

export type TicketPlanDetails = {
  plan: string | null;
  leadCap: number | null;
  leadBudget: string | null;
  regions: string[];
  cities: string[];
  durationStart: string | null;
  durationEnd: string | null;
  assuredBookings: number | null;
  avgRevenueTarget: number | null;
  quotedAmount: number | null;
  plansShared: Array<{ plan: string; amount: number }>;
};

export type TicketLeadContext = {
  leadId: string;
  displayId: string;
  brideName: string;
  phone: string | null;
  region: string | null;
  status: string;
  eventDate: string | null;
  assignedRmName: string | null;
  muasOffered: number;
  openTicketCount: number;
};

export type TicketContext = {
  lead: TicketLeadContext | null;
  mua: {
    id: string;
    name: string;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    city: string | null;
    status: string | null;
    planTier: string | null;
    planTierName: string | null;
    planExpiry: string | null;
    weeklyCap: number | null;
    monthlyPushTarget: number | null;
    assuredBookings: number | null;
    assignedRmName: string | null;
  } | null;
  pipeline: {
    id: string;
    stage: string;
    muaType: string | null;
    assignedToName: string | null;
  } | null;
  planDetails: TicketPlanDetails | null;
  activation: {
    profileVerified: boolean | null;
    invoiceGenerated: boolean | null;
    contractGenerated: boolean | null;
  } | null;
  recentPushes: Array<{
    leadDisplayId: string;
    brideName: string;
    stage: string;
    status: string;
    createdAt: string;
  }>;
  recentComms: Array<{
    entryType: string;
    description: string;
    createdAt: string;
  }>;
  openTicketCount: number;
  muaTicketHistory: Array<{
    id: string;
    ticketNumber: string;
    status: string;
    category: string;
    createdAt: string;
    closedAt: string | null;
    isCurrent: boolean;
  }>;
};

function mapPlanDetails(raw: Record<string, unknown> | null | undefined): TicketPlanDetails | null {
  const onboarding = mapOnboardingRow(raw ?? null);
  if (!onboarding) return null;

  const hasPlan =
    onboarding.plan ||
    onboarding.leadCap ||
    onboarding.leadBudget ||
    (onboarding.plansShared?.length ?? 0) > 0 ||
    onboarding.quotedAmount;

  if (!hasPlan) return null;

  return {
    plan: (onboarding.plan as string) ?? null,
    leadCap: onboarding.leadCap != null ? Number(onboarding.leadCap) : null,
    leadBudget: (onboarding.leadBudget as string) ?? null,
    regions: (onboarding.regions as string[]) ?? [],
    cities: (onboarding.cities as string[]) ?? [],
    durationStart: onboarding.durationStart ? String(onboarding.durationStart).slice(0, 10) : null,
    durationEnd: onboarding.durationEnd ? String(onboarding.durationEnd).slice(0, 10) : null,
    assuredBookings:
      onboarding.assuredBookings != null ? Number(onboarding.assuredBookings) : null,
    avgRevenueTarget:
      onboarding.avgRevenueTarget != null ? Number(onboarding.avgRevenueTarget) : null,
    quotedAmount: onboarding.quotedAmount != null ? Number(onboarding.quotedAmount) : null,
    plansShared: onboarding.plansShared ?? [],
  };
}

export async function buildTicketContext(
  tx: TransactionSql,
  muaId: string | null,
  currentTicketId?: string | null,
  leadId?: string | null
): Promise<TicketContext> {
  const lead = leadId ? await fetchLeadContext(tx, leadId, currentTicketId) : null;

  if (!muaId) {
    return {
      lead,
      mua: null,
      pipeline: null,
      planDetails: null,
      activation: null,
      recentPushes: [],
      recentComms: [],
      openTicketCount: 0,
      muaTicketHistory: [],
    };
  }

  const [mua] = await tx<
    {
      id: string;
      name: string;
      phone: string | null;
      whatsapp: string | null;
      email: string | null;
      city: string | null;
      status: string | null;
      planTier: string | null;
      planTierName: string | null;
      planExpiry: string | null;
      weeklyCap: number | null;
      monthlyPushTarget: number | null;
      assuredBookings: number | null;
      assignedRmName: string | null;
    }[]
  >`
    SELECT
      m.id,
      m.name,
      m.phone,
      m.whatsapp,
      m.email,
      m.city,
      m.status,
      m.plan_tier::text AS "planTier",
      pt.name AS "planTierName",
      m.plan_expiry::text AS "planExpiry",
      pt.weekly_cap AS "weeklyCap",
      pt.monthly_push_target AS "monthlyPushTarget",
      pt.assured_bookings AS "assuredBookings",
      rm.name AS "assignedRmName"
    FROM muas m
    LEFT JOIN plan_tiers pt ON pt.tier = m.plan_tier
    LEFT JOIN staff rm ON rm.id = m.assigned_rm_id
    WHERE m.id = ${muaId}::uuid
  `;

  const [pipeline] = await tx<
    { id: string; stage: string; muaType: string | null; assignedToName: string | null }[]
  >`
    SELECT p.id, p.stage, p.mua_type AS "muaType", s.name AS "assignedToName"
    FROM sales.pipeline p
    LEFT JOIN staff s ON s.id = p.assigned_to
    WHERE p.mua_id = ${muaId}::uuid AND p.status = 'active'
    ORDER BY p.updated_at DESC
    LIMIT 1
  `;

  let planDetails: TicketPlanDetails | null = null;
  let activation: TicketContext["activation"] = null;

  if (pipeline?.id) {
    const [onboarding] = await tx<Record<string, unknown>[]>`
      SELECT
        plan,
        lead_cap,
        lead_budget,
        regions,
        cities,
        duration_start,
        duration_end,
        assured_bookings,
        avg_revenue_target,
        quoted_amount,
        plans_shared
      FROM sales.onboarding
      WHERE pipeline_id = ${pipeline.id}::uuid
      LIMIT 1
    `;
    planDetails = mapPlanDetails(onboarding);

    const [act] = await tx<
      { profileVerified: boolean | null; invoiceGenerated: boolean | null; contractGenerated: boolean | null }[]
    >`
      SELECT
        profile_link_verified AS "profileVerified",
        invoice_generated AS "invoiceGenerated",
        contract_generated AS "contractGenerated"
      FROM sales.activation_log
      WHERE pipeline_id = ${pipeline.id}::uuid
      LIMIT 1
    `;
    activation = act ?? null;
  }

  const recentPushes = await tx<
    { leadDisplayId: string; brideName: string; stage: string; status: string; createdAt: string }[]
  >`
    SELECT
      bl.display_id AS "leadDisplayId",
      bl.bride_name AS "brideName",
      mp.stage::text,
      mp.status::text,
      mp.created_at AS "createdAt"
    FROM mua_pushes mp
    JOIN bride_leads bl ON bl.id = mp.lead_id
    WHERE mp.mua_id = ${muaId}::uuid
    ORDER BY mp.created_at DESC
    LIMIT 10
  `;

  const recentComms = await tx<
    { entryType: string; description: string; createdAt: string }[]
  >`
    SELECT entry_type::text AS "entryType", description, created_at AS "createdAt"
    FROM comms
    WHERE mua_id = ${muaId}::uuid
    ORDER BY created_at DESC
    LIMIT 15
  `;

  const [countRow] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM support.tickets
    WHERE mua_id = ${muaId}::uuid AND status <> 'closed'
  `;

  const muaTicketHistory = await tx<
    {
      id: string;
      ticketNumber: string;
      status: string;
      category: string;
      createdAt: string;
      closedAt: string | null;
    }[]
  >`
    SELECT
      t.id,
      t.ticket_number AS "ticketNumber",
      t.status::text AS status,
      t.category,
      t.created_at AS "createdAt",
      t.closed_at AS "closedAt"
    FROM support.tickets t
    WHERE t.mua_id = ${muaId}::uuid
    ORDER BY t.created_at DESC
    LIMIT 20
  `;

  return {
    lead,
    mua: mua ?? null,
    pipeline: pipeline ?? null,
    planDetails,
    activation,
    recentPushes,
    recentComms,
    openTicketCount: countRow?.count ?? 0,
    muaTicketHistory: muaTicketHistory.map((t: { id: string; [key: string]: unknown }) => ({
      ...t,
      isCurrent: Boolean(currentTicketId && t.id === currentTicketId),
    })),
  };
}

async function fetchLeadContext(
  tx: TransactionSql,
  leadId: string,
  currentTicketId?: string | null
): Promise<TicketLeadContext | null> {
  const [lead] = await tx<
    {
      leadId: string;
      displayId: string;
      brideName: string;
      phone: string | null;
      region: string | null;
      status: string;
      eventDate: string | null;
      assignedRmName: string | null;
      muasOffered: number;
    }[]
  >`
    SELECT
      bl.id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.phone,
      bl.region::text AS region,
      bl.status::text AS status,
      bl.event_date::text AS "eventDate",
      rm.name AS "assignedRmName",
      (
        SELECT COUNT(DISTINCT mp.mua_id)::int
        FROM mua_pushes mp
        WHERE mp.lead_id = bl.id
      ) AS "muasOffered"
    FROM bride_leads bl
    LEFT JOIN staff rm ON rm.id = bl.assigned_rm_id
    WHERE bl.id = ${leadId}::uuid
    LIMIT 1
  `;

  if (!lead) return null;

  const [countRow] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM support.tickets
    WHERE lead_id = ${leadId}::uuid AND status <> 'closed'
  `;

  void currentTicketId;

  return {
    ...lead,
    openTicketCount: countRow?.count ?? 0,
  };
}
