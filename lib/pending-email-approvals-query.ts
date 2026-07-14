import { sql } from "@/db/index";
import type { PendingEmailApprovalRow } from "@/lib/pending-email-approvals-types";

export type { PendingEmailApprovalRow } from "@/lib/pending-email-approvals-types";

export async function fetchPendingEmailApprovals(): Promise<PendingEmailApprovalRow[]> {
  const rows = await sql<PendingEmailApprovalRow[]>`
    SELECT
      e.id AS "emailId",
      e.subject,
      e.body_html AS "bodyHtml",
      e.to_email AS "toEmail",
      e.approval_tier AS "approvalTier",
      e.created_at AS "createdAt",
      COALESCE(e.attachment_ids, '{}') AS "attachmentIds",
      t.id AS "ticketId",
      t.ticket_number AS "ticketNumber",
      t.status::text AS "ticketStatus",
      t.category,
      t.raised_by_type::text AS "raisedByType",
      t.raised_by_name AS "raisedByName",
      t.complaint_text AS "complaintText",
      t.urgency::text AS urgency,
      t.sla_due_at AS "slaDueAt",
      t.sla_breached AS "slaBreached",
      m.name AS "muaName",
      bl.bride_name AS "brideName",
      creator.name AS "createdByName"
    FROM support.ticket_email_responses e
    JOIN support.tickets t ON t.id = e.ticket_id
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    LEFT JOIN staff creator ON creator.id = e.created_by
    WHERE e.status = 'pending_approval'
    ORDER BY
      t.sla_breached DESC,
      t.sla_due_at ASC NULLS LAST,
      CASE t.urgency::text
        WHEN 'high' THEN 0
        WHEN 'medium' THEN 1
        ELSE 2
      END,
      e.created_at ASC
  `;
  return rows;
}
