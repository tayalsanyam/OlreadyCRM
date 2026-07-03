import type { TransactionSql } from "@/db/index";
import { fromDbPlanTier } from "@/lib/db-mappers";
import {
  normalizeServiceOfferings,
  type MuaServiceOffering,
} from "@/lib/mua-service-catalog";
import { fetchMuaRegions } from "@/lib/mua-regions-db";
import { assertPipelineAccess } from "@/lib/sales-pipeline-access";
import type { PlanTier, Region, SessionUser } from "@/lib/types";

export type SalesPipelineProfilePayload = {
  mua: {
    id: string;
    displayId: string;
    name: string;
    phone: string | null;
    city: string;
    source: string | null;
    whatsapp: string | null;
    instagram: string | null;
    bio: string | null;
    specialties: string[];
    services: string[];
    serviceOfferings: MuaServiceOffering[];
    regions: Region[];
    preferredContactChannel: string | null;
    businessName: string | null;
    officialAddress: string | null;
    gstNumber: string | null;
    email: string | null;
    alternatePhone: string | null;
    businessManagerPhone: string | null;
    avgRevenueTarget: number | null;
    planTier: PlanTier | null;
    planExpiry: string | null;
    status: string;
    joinDate: string | null;
    assignedRmName: string | null;
  };
  pipeline: {
    id: string;
    stage: string;
    muaType: string;
    salesNotes: string | null;
    preferredContactTime: string | null;
    assignedToName: string | null;
  };
  onboarding: {
    businessName: string | null;
    email: string | null;
    alternatePhone: string | null;
    plan: string | null;
    checklist1Complete: boolean;
    checklist2Complete: boolean;
  } | null;
};

export async function fetchSalesPipelineProfile(
  tx: TransactionSql,
  session: Pick<SessionUser, "userId" | "role">,
  pipelineId: string,
): Promise<SalesPipelineProfilePayload | null> {
  const pipe = await assertPipelineAccess(tx, session, pipelineId);

  const [mua] = await tx<
    {
      id: string;
      displayId: string;
      name: string;
      phone: string | null;
      city: string;
      source: string | null;
      whatsapp: string | null;
      instagram: string | null;
      bio: string | null;
      specialties: string[] | null;
      services: string[] | null;
      serviceOfferings: unknown;
      preferredContactChannel: string | null;
      businessName: string | null;
      officialAddress: string | null;
      gstNumber: string | null;
      email: string | null;
      alternatePhone: string | null;
      businessManagerPhone: string | null;
      avgRevenueTarget: number | null;
      planTier: string | null;
      planExpiry: string | null;
      status: string;
      joinDate: string | null;
      assignedRmName: string | null;
    }[]
  >`
    SELECT
      m.id,
      m.display_id AS "displayId",
      m.name,
      m.phone,
      m.city,
      m.source,
      m.whatsapp,
      m.instagram,
      m.bio,
      m.specialties,
      m.services,
      m.service_offerings AS "serviceOfferings",
      m.preferred_contact_channel AS "preferredContactChannel",
      m.business_name AS "businessName",
      m.official_address AS "officialAddress",
      m.gst_number AS "gstNumber",
      COALESCE(
        NULLIF(BTRIM(m.email), ''),
        (
          SELECT NULLIF(BTRIM(o.email), '')
          FROM sales.onboarding o
          WHERE o.pipeline_id = ${pipelineId}::uuid
          LIMIT 1
        )
      ) AS email,
      m.alternate_phone AS "alternatePhone",
      m.business_manager_phone AS "businessManagerPhone",
      m.avg_revenue_target AS "avgRevenueTarget",
      m.plan_tier::text AS "planTier",
      m.plan_expiry::text AS "planExpiry",
      m.status,
      m.join_date::text AS "joinDate",
      rm.name AS "assignedRmName"
    FROM muas m
    LEFT JOIN staff rm ON rm.id = m.assigned_rm_id
    WHERE m.id = ${pipe.muaId}::uuid
    LIMIT 1
  `;
  if (!mua) return null;

  const regions = await fetchMuaRegions(pipe.muaId);

  const [pipeline] = await tx<
    {
      id: string;
      stage: string;
      muaType: string;
      salesNotes: string | null;
      preferredContactTime: string | null;
      assignedToName: string | null;
    }[]
  >`
    SELECT
      p.id,
      p.stage,
      p.mua_type AS "muaType",
      p.sales_notes AS "salesNotes",
      p.preferred_contact_time AS "preferredContactTime",
      a.name AS "assignedToName"
    FROM sales.pipeline p
    LEFT JOIN staff a ON a.id = p.assigned_to
    WHERE p.id = ${pipelineId}::uuid
    LIMIT 1
  `;
  if (!pipeline) return null;

  const [onboarding] = await tx<
    {
      businessName: string | null;
      email: string | null;
      alternatePhone: string | null;
      plan: string | null;
      checklist1Complete: boolean;
      checklist2Complete: boolean;
    }[]
  >`
    SELECT
      business_name AS "businessName",
      email,
      alternate_phone AS "alternatePhone",
      plan,
      checklist1_complete AS "checklist1Complete",
      checklist2_complete AS "checklist2Complete"
    FROM sales.onboarding
    WHERE pipeline_id = ${pipelineId}::uuid
    LIMIT 1
  `;

  return {
    mua: {
      ...mua,
      specialties: mua.specialties ?? [],
      services: mua.services ?? [],
      serviceOfferings: normalizeServiceOfferings(mua.serviceOfferings),
      regions,
      planTier: fromDbPlanTier(mua.planTier),
      planExpiry: mua.planExpiry,
    },
    pipeline,
    onboarding: onboarding ?? null,
  };
}
