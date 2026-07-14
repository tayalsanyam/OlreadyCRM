import { sql } from "@/db/index";
import { csvDateCell } from "@/lib/utils";
import { fromDbStatus, fromDbTier } from "@/lib/db-mappers";
import {
  UPLOADER_CONFIRMATION_LABELS,
} from "@/lib/lead-exit";
import type { Region, UploaderConfirmation } from "@/lib/types";

export type NiLeadSource = "regional" | "commission";

export type NiLeadRow = {
  id: string;
  displayId: string;
  brideName: string;
  region: string;
  budgetTier: string;
  source: string | null;
  rmName: string | null;
  handoverReason: string | null;
  exitMarkedByRole: string | null;
  uploaderConfirmation: string | null;
  leadStatus: string;
  niSource: NiLeadSource;
  currentOwner: string;
  currentOwnerKind: "commission_rm" | "lead_uploader" | "closed";
  isActiveInCommission: boolean;
  niDate: string;
  shiftedAt: string | null;
  createdAt: string;
  daysToNi: number;
};

export type NiLeadsQueryParams = {
  from?: string | null;
  to?: string | null;
  region?: string | null;
  rmId?: string | null;
  niSource?: NiLeadSource | null;
  /** When set, restricts results to this RM regardless of rmId filter. */
  scopeRmId?: string | null;
  scopeCommission?: boolean;
};

function resolveNiSource(
  leadStatus: string,
  exitMarkedByRole: string | null
): NiLeadSource {
  if (exitMarkedByRole === "commission_rm") return "commission";
  if (isInCommissionQueue(leadStatus)) return "regional";
  return "regional";
}

function isInCommissionQueue(status: string): boolean {
  return status === "commission_rm" || status === "commissionRm";
}

function resolveCurrentOwner(row: {
  leadStatus: string;
  rmName: string | null;
  uploaderConfirmation: string | null;
}): Pick<NiLeadRow, "currentOwner" | "currentOwnerKind" | "isActiveInCommission"> {
  if (isInCommissionQueue(row.leadStatus)) {
    return {
      currentOwner: row.rmName
        ? `Commission RM · ${row.rmName}`
        : "Commission RM",
      currentOwnerKind: "commission_rm",
      isActiveInCommission: true,
    };
  }

  if (row.leadStatus === "archived") {
    if (!row.uploaderConfirmation) {
      return {
        currentOwner: "Lead Uploader · review pending",
        currentOwnerKind: "lead_uploader",
        isActiveInCommission: false,
      };
    }
    const label =
      UPLOADER_CONFIRMATION_LABELS[row.uploaderConfirmation as UploaderConfirmation] ??
      row.uploaderConfirmation;
    return {
      currentOwner: `Lead Uploader · ${label}`,
      currentOwnerKind: "closed",
      isActiveInCommission: false,
    };
  }

  return {
    currentOwner: row.rmName ?? "Unassigned",
    currentOwnerKind: "closed",
    isActiveInCommission: false,
  };
}

export async function fetchNiLeads(params: NiLeadsQueryParams): Promise<NiLeadRow[]> {
  const from = params.from ?? null;
  const to = params.to ?? null;
  const region = (params.region ?? null) as Region | null;
  const rmId = params.rmId ?? null;
  const niSource = params.niSource ?? null;
  const scopeRmId = params.scopeRmId ?? null;
  const scopeCommission = params.scopeCommission ?? false;
  const filterRegional = niSource === "regional";
  const filterCommission = niSource === "commission";

  const rows = await sql<
    {
      id: string;
      displayId: string;
      brideName: string;
      region: string;
      budgetTier: string;
      source: string | null;
      rmName: string | null;
      handoverReason: string | null;
      exitMarkedByRole: string | null;
      uploaderConfirmation: string | null;
      leadStatus: string;
      shiftedAt: string | null;
      niDate: string;
      createdAt: string;
      daysToNi: number;
    }[]
  >`
    SELECT
      bl.id,
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.region::text AS region,
      bl.budget_tier::text AS "budgetTier",
      bl.source,
      s.name AS "rmName",
      bl.handover_reason AS "handoverReason",
      bl.exit_marked_by_role::text AS "exitMarkedByRole",
      bl.uploader_confirmation::text AS "uploaderConfirmation",
      bl.status::text AS "leadStatus",
      bl.shifted_at::text AS "shiftedAt",
      COALESCE(bl.shifted_at, bl.updated_at) AS "niDate",
      bl.created_at AS "createdAt",
      (EXTRACT(EPOCH FROM COALESCE(bl.shifted_at, bl.updated_at) - bl.created_at) / 86400)::int AS "daysToNi"
    FROM bride_leads bl
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    WHERE (
      (
        bl.status = 'commission_rm'
        AND (
          bl.shifted_at IS NOT NULL
          OR bl.handover_reason ILIKE '%not interested%'
        )
      )
      OR (
        bl.status = 'archived'
        AND bl.handover_reason ILIKE '%not interested%'
        AND NOT (
          bl.hostile_note IS NOT NULL
          AND TRIM(bl.hostile_note) <> ''
        )
      )
      OR (
        bl.status = 'archived'
        AND bl.hostile_note IS NOT NULL
        AND TRIM(bl.hostile_note) <> ''
      )
    )
      AND (${from}::date IS NULL OR COALESCE(bl.shifted_at, bl.updated_at)::date >= ${from}::date)
      AND (${to}::date IS NULL OR COALESCE(bl.shifted_at, bl.updated_at)::date <= ${to}::date)
      AND (${region}::text IS NULL OR bl.region = ${region}::region)
      AND (${rmId}::uuid IS NULL OR bl.assigned_rm_id = ${rmId}::uuid)
      AND (${scopeRmId}::uuid IS NULL OR bl.assigned_rm_id = ${scopeRmId}::uuid)
      AND (${scopeCommission}::boolean = false OR bl.status = 'commission_rm')
      AND (
        ${filterRegional}::boolean = false
        OR bl.exit_marked_by_role = 'regional_rm'
        OR (
          bl.status = 'commission_rm'
          AND bl.shifted_at IS NOT NULL
        )
      )
      AND (
        ${filterCommission}::boolean = false
        OR bl.exit_marked_by_role = 'commission_rm'
      )
    ORDER BY
      (bl.status = 'commission_rm') DESC,
      COALESCE(bl.shifted_at, bl.updated_at) DESC
  `;

  return rows.map((r) => {
    const leadStatus = fromDbStatus(r.leadStatus);
    const owner = resolveCurrentOwner({
      leadStatus,
      rmName: r.rmName,
      uploaderConfirmation: r.uploaderConfirmation,
    });

    return {
      id: r.id,
      displayId: r.displayId,
      brideName: r.brideName,
      region: r.region,
      budgetTier: fromDbTier(r.budgetTier),
      source: r.source,
      rmName: r.rmName,
      handoverReason: r.handoverReason,
      exitMarkedByRole: r.exitMarkedByRole,
      uploaderConfirmation: r.uploaderConfirmation,
      leadStatus,
      niSource: resolveNiSource(leadStatus, r.exitMarkedByRole),
      ...owner,
      niDate: r.niDate,
      shiftedAt: r.shiftedAt,
      createdAt: r.createdAt,
      daysToNi: r.daysToNi,
    };
  });
}

export function niLeadsToCsv(rows: NiLeadRow[]): string {
  const header =
    "displayId,brideName,region,budgetTier,source,niSource,leadStatus,currentOwner,rmName,handoverReason,exitMarkedByRole,uploaderConfirmation,niDate,daysToNi,activeInCommission";
  const lines = rows.map((r) =>
    [
      r.displayId,
      `"${r.brideName.replace(/"/g, '""')}"`,
      r.region,
      r.budgetTier,
      r.source ?? "",
      r.niSource,
      r.leadStatus,
      `"${r.currentOwner.replace(/"/g, '""')}"`,
      r.rmName ?? "",
      `"${(r.handoverReason ?? "").replace(/"/g, '""')}"`,
      r.exitMarkedByRole ?? "",
      r.uploaderConfirmation ?? "",
      csvDateCell(r.niDate),
      r.daysToNi,
      r.isActiveInCommission ? "yes" : "no",
    ].join(",")
  );
  return [header, ...lines].join("\n");
}
