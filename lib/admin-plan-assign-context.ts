import { sql, type TransactionSql } from "@/db/index";
import { latestPipelineIdForMua } from "@/lib/admin-mua-plan-controls-pipeline";
import { readStoredBoolean } from "@/lib/sales-plan-details";
import { fetchPlanRmOptionsForRegions } from "@/lib/plan-rm";
import { fetchMuaRegions } from "@/lib/mua-regions-db";
import { MUA_PLAN_RM_NAME_SQL } from "@/lib/mua-contact-sql";
import type { Region } from "@/lib/types";

export type AdminPlanAssignContext = {
  pipelineId: string | null;
  planRmId: string | null;
  planRmName: string | null;
  salesClosedById: string | null;
  salesClosedByName: string | null;
  rmSupport: boolean | null;
  leadReversal: boolean | null;
  hasSocialMedia: boolean | null;
  socialMedia: string | null;
  invoiceGenerated: boolean;
  invoiceNumber: string | null;
  contractGenerated: boolean;
  contractUrl: string | null;
  regions: Region[];
  planRmOptions: { id: string; name: string; region: string }[];
};

export async function fetchAdminPlanAssignContext(
  muaId: string,
): Promise<AdminPlanAssignContext | null> {
  const [mua] = await sql<
    {
      planRmId: string | null;
      planRmName: string | null;
      salesClosedById: string | null;
      salesClosedByName: string | null;
    }[]
  >`
    SELECT
      m.plan_rm_id AS "planRmId",
      ${sql.unsafe(MUA_PLAN_RM_NAME_SQL)} AS "planRmName",
      COALESCE(p.sales_closed_by, m.sales_closed_by) AS "salesClosedById",
      COALESCE(sc_pipe.name, sc_mua.name) AS "salesClosedByName"
    FROM muas m
    LEFT JOIN staff sc_mua ON sc_mua.id = m.sales_closed_by
    LEFT JOIN LATERAL (
      SELECT id, sales_closed_by
      FROM sales.pipeline
      WHERE mua_id = m.id
        AND status = 'active'
        AND stage <> 'Rejected'
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    ) p ON true
    LEFT JOIN staff sc_pipe ON sc_pipe.id = p.sales_closed_by
    WHERE m.id = ${muaId}::uuid
    LIMIT 1
  `;
  if (!mua) return null;

  const regions = await fetchMuaRegions(muaId);
  const pipelineId = await latestPipelineIdForMua(sql, muaId);

  let rmSupport: boolean | null = null;
  let leadReversal: boolean | null = null;
  let hasSocialMedia: boolean | null = null;
  let socialMedia: string | null = null;
  let invoiceGenerated = false;
  let invoiceNumber: string | null = null;
  let contractGenerated = false;
  let contractUrl: string | null = null;

  if (pipelineId) {
    const [onb] = await sql<
      {
        rmSupport: boolean | string | null;
        leadReversal: boolean | string | null;
        socialMedia: string | null;
      }[]
    >`
      SELECT
        rm_support AS "rmSupport",
        lead_reversal_offered AS "leadReversal",
        social_media AS "socialMedia"
      FROM sales.onboarding
      WHERE pipeline_id = ${pipelineId}::uuid
      LIMIT 1
    `;
    if (onb) {
      rmSupport = readStoredBoolean(onb.rmSupport);
      leadReversal = readStoredBoolean(onb.leadReversal);
      const sm = onb.socialMedia?.trim() ?? "";
      if (onb.socialMedia !== null && onb.socialMedia !== undefined) {
        hasSocialMedia = sm.length > 0;
        socialMedia = sm || null;
        if (onb.socialMedia === "") hasSocialMedia = false;
      }
    }

    const [act] = await sql<
      {
        invoiceGenerated: boolean;
        invoiceNumber: string | null;
        contractGenerated: boolean;
        contractUrl: string | null;
      }[]
    >`
      SELECT
        COALESCE(invoice_generated, false) AS "invoiceGenerated",
        invoice_number AS "invoiceNumber",
        COALESCE(contract_generated, false) AS "contractGenerated",
        contract_url AS "contractUrl"
      FROM sales.activation_log
      WHERE pipeline_id = ${pipelineId}::uuid
      LIMIT 1
    `;
    if (act) {
      invoiceGenerated = act.invoiceGenerated;
      invoiceNumber = act.invoiceNumber;
      contractGenerated = act.contractGenerated;
      contractUrl = act.contractUrl;
    }
  }

  const planRmOptions = await fetchPlanRmOptionsForRegions(sql, regions);

  return {
    pipelineId,
    planRmId: mua.planRmId,
    planRmName: mua.planRmName,
    salesClosedById: mua.salesClosedById,
    salesClosedByName: mua.salesClosedByName,
    rmSupport,
    leadReversal,
    hasSocialMedia,
    socialMedia,
    invoiceGenerated,
    invoiceNumber,
    contractGenerated,
    contractUrl,
    regions,
    planRmOptions,
  };
}
