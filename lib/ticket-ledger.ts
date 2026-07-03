import type { TransactionSql } from "@/db/index";
import { appendComm } from "@/db/index";
import { COMM } from "@/lib/comm-types";

async function resolveLeadIdForMua(
  tx: TransactionSql,
  muaId: string,
  preferredLeadId?: string | null
): Promise<string | null> {
  if (preferredLeadId) return preferredLeadId;

  const [row] = await tx<{ leadId: string }[]>`
    SELECT mp.lead_id AS "leadId"
    FROM mua_pushes mp
    WHERE mp.mua_id = ${muaId}::uuid
    ORDER BY mp.created_at DESC
    LIMIT 1
  `;
  return row?.leadId ?? null;
}

export async function logCareComm(
  tx: TransactionSql,
  params: {
    muaId: string;
    leadId?: string | null;
    entryType: keyof typeof COMM;
    description: string;
    actorId: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const leadId = await resolveLeadIdForMua(tx, params.muaId, params.leadId);
  if (!leadId) {
    console.warn("[ticket-ledger] No lead for MUA comm — skipped", params.description);
    return;
  }

  await appendComm(tx, {
    leadId,
    muaId: params.muaId,
    entryType: COMM[params.entryType],
    description: params.description,
    actorId: params.actorId,
    metadata: {
      ...params.metadata,
      source: "grievance_centre",
    },
  });
}

export async function notifyAdminsOfTicket(
  tx: TransactionSql,
  params: { ticketNumber: string; ticketId: string; message: string }
): Promise<void> {
  const admins = await tx<{ id: string }[]>`
    SELECT id FROM staff
    WHERE role IN ('admin', 'owner') AND active = true
  `;

  for (const admin of admins) {
    await tx`
      INSERT INTO notifications (staff_id, message, link)
      VALUES (
        ${admin.id}::uuid,
        ${params.message},
        ${`/care/grievances/${params.ticketId}`}
      )
    `;
  }
}
