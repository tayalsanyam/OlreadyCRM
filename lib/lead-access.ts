import { sql } from "@/db/index";
import { fromDbStatus } from "@/lib/db-mappers";
import type { Region, SessionUser, UserRole } from "@/lib/types";

export interface LeadAccessRow {
  status: string;
  region: string;
  assignedRmId: string | null;
  portalOnly: boolean;
  shiftedAt: string | null;
  feedbackEligible?: boolean;
}

function normalizeStatus(status: string): string {
  if (status.includes("_")) return fromDbStatus(status);
  return status;
}

export async function getLeadForAccess(
  leadId: string
): Promise<LeadAccessRow | null> {
  const [row] = await sql<
    {
      status: string;
      region: string;
      assignedRmId: string | null;
      portalOnly: boolean;
      shiftedAt: string | null;
      feedbackEligible: boolean;
    }[]
  >`
    SELECT
      bl.status::text,
      bl.region::text,
      bl.assigned_rm_id AS "assignedRmId",
      COALESCE(bl.portal_only, false) AS "portalOnly",
      bl.shifted_at AS "shiftedAt",
      (
        bl.status IN ('expired'::lead_status, 'booked'::lead_status)
        AND NOT EXISTS (
          SELECT 1 FROM lead_events le
          WHERE le.lead_id = bl.id
            AND le.status != 'not_needed'
            AND le.event_date >= CURRENT_DATE
        )
      ) AS "feedbackEligible"
    FROM bride_leads bl
    WHERE bl.id = ${leadId}::uuid
  `;
  return row ?? null;
}

export function canAccessLead(
  session: SessionUser,
  lead: LeadAccessRow
): boolean {
  const elevated: UserRole[] = ["admin", "owner", "careAgent"];
  if (elevated.includes(session.role)) return true;

  const status = normalizeStatus(lead.status);

  if (session.role === "feedbackRm") {
    return lead.feedbackEligible === true;
  }

  if (session.role === "leadUploader") {
    const blocked = ["commissionRm", "expired", "missed"];
    return !blocked.includes(status);
  }

  if (session.role === "commissionRm") {
    if (lead.shiftedAt) {
      if (lead.assignedRmId && lead.assignedRmId !== session.userId) return false;
      return true;
    }
    if (status === "commissionRm") {
      if (lead.assignedRmId && lead.assignedRmId !== session.userId) return false;
      return true;
    }
    if (status === "verified" && lead.portalOnly) return true;
    return false;
  }

  if (session.role === "regionalRm") {
    if (status === "commissionRm" || status === "archived") {
      return false;
    }
    if (lead.assignedRmId !== session.userId) return false;
    const allowed =
      session.regions?.length
        ? session.regions
        : session.region
          ? [session.region]
          : [];
    if (allowed.length && !allowed.includes(lead.region as Region)) return false;
    return true;
  }

  return false;
}
